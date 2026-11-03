//! Watches open repositories for changes made outside Git Panther.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};

/// Bursts of file events (a checkout, a build) collapse into one notification.
const DEBOUNCE: Duration = Duration::from_millis(300);

#[derive(Default)]
pub struct RepositoryWatcher {
    active: Mutex<HashMap<PathBuf, Debouncer<RecommendedWatcher>>>,
}

impl RepositoryWatcher {
    /// Starts watching `root` recursively; `on_change` runs once per burst of
    /// changes. Watching an already-watched repository is a no-op.
    ///
    /// # Errors
    /// Returns the watcher error message when the OS refuses the watch.
    pub fn watch(&self, root: &Path, on_change: impl Fn() + Send + 'static) -> Result<(), String> {
        let mut active = self.lock();
        if active.contains_key(root) {
            return Ok(());
        }
        let mut debouncer = new_debouncer(DEBOUNCE, move |result: DebounceEventResult| {
            if result.is_ok_and(|events| !events.is_empty()) {
                on_change();
            }
        })
        .map_err(|error| error.to_string())?;
        debouncer
            .watcher()
            .watch(root, RecursiveMode::Recursive)
            .map_err(|error| error.to_string())?;
        active.insert(root.to_path_buf(), debouncer);
        Ok(())
    }

    /// Stops watching `root`; dropping the debouncer releases the OS watch.
    pub fn unwatch(&self, root: &Path) {
        self.lock().remove(root);
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<PathBuf, Debouncer<RecommendedWatcher>>> {
        // Insert/remove cannot leave the map half-updated, so a poisoned
        // lock is still safe to use.
        self.active.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::mpsc;

    use tempfile::TempDir;

    use super::*;

    #[test]
    fn reports_changes_inside_the_repository() {
        let dir = TempDir::new().unwrap();
        let watcher = RepositoryWatcher::default();
        let (sender, changes) = mpsc::channel();
        watcher
            .watch(dir.path(), move || {
                let _ = sender.send(());
            })
            .unwrap();

        fs::write(dir.path().join("README.md"), "hello").unwrap();

        changes
            .recv_timeout(Duration::from_secs(5))
            .expect("a change notification within 5 seconds");
        watcher.unwatch(dir.path());
    }
}

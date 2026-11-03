//! Tracks cancellable background jobs by an id chosen by the UI.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use panther_domain::repository::CancellationToken;

#[derive(Default)]
pub struct JobRegistry {
    jobs: Mutex<HashMap<String, CancellationToken>>,
}

impl JobRegistry {
    /// Registers a job and returns the token it should watch.
    pub fn start(&self, job_id: &str) -> CancellationToken {
        let token = CancellationToken::default();
        self.lock().insert(job_id.to_owned(), token.clone());
        token
    }

    /// Requests cancellation; unknown or finished jobs are ignored.
    pub fn cancel(&self, job_id: &str) {
        if let Some(token) = self.lock().get(job_id) {
            token.cancel();
        }
    }

    pub fn finish(&self, job_id: &str) {
        self.lock().remove(job_id);
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<String, CancellationToken>> {
        // A panic while holding this lock cannot leave the map inconsistent,
        // so recovering from poisoning is safe.
        self.jobs
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancels_running_jobs() {
        let registry = JobRegistry::default();
        let token = registry.start("clone-1");
        registry.cancel("clone-1");
        assert!(token.is_cancelled());
    }

    #[test]
    fn ignores_unknown_and_finished_jobs() {
        let registry = JobRegistry::default();
        let token = registry.start("clone-1");
        registry.finish("clone-1");
        registry.cancel("clone-1");
        registry.cancel("never-started");
        assert!(!token.is_cancelled());
    }
}

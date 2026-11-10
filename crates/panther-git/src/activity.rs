//! Remembers the git commands Git Panther ran, for the activity log: what,
//! where, how long, whether it worked and what git printed (hook output
//! included). Kept in memory only, newest last, at most [`CAPACITY`].

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// How many commands the log keeps.
const CAPACITY: usize = 500;
/// How much of git's output each entry keeps.
const OUTPUT_LIMIT: usize = 4_000;

/// git commands that only read; everything else changes something.
const READ_ONLY: &[&str] = &[
    "blame",
    "cat-file",
    "describe",
    "diff",
    "for-each-ref",
    "log",
    "ls-files",
    "ls-remote",
    "merge-base",
    "rev-list",
    "rev-parse",
    "shortlog",
    "show",
    "status",
    "version",
];

/// One git command as it ran.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitActivity {
    /// When it started, in milliseconds since the Unix epoch.
    pub started_ms: u64,
    pub repository: PathBuf,
    /// `git` and its arguments.
    pub command: String,
    pub duration_ms: u64,
    pub succeeded: bool,
    /// What git printed, cut to the last few thousand characters.
    pub output: String,
    /// Changed something (commit, push, checkout…) rather than only read.
    pub changes: bool,
}

static LOG: Mutex<VecDeque<GitActivity>> = Mutex::new(VecDeque::new());

/// Records a command that started at `started` and has just finished.
pub fn record(repository: &Path, args: &[&str], started: Instant, succeeded: bool, output: &str) {
    let elapsed = started.elapsed();
    let started_ms = SystemTime::now()
        .checked_sub(elapsed)
        .and_then(|at| at.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |since| {
            u64::try_from(since.as_millis()).unwrap_or(u64::MAX)
        });
    let output = output.trim();
    let output = match output.char_indices().nth_back(OUTPUT_LIMIT) {
        Some((cut, _)) => format!("…{}", &output[cut..]),
        None => output.to_owned(),
    };
    let entry = GitActivity {
        started_ms,
        repository: repository.to_path_buf(),
        command: format!("git {}", args.join(" ")),
        duration_ms: u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX),
        succeeded,
        output,
        changes: changes_something(args),
    };
    let mut log = LOG.lock().unwrap_or_else(PoisonError::into_inner);
    if log.len() == CAPACITY {
        log.pop_front();
    }
    log.push_back(entry);
}

/// The commands run in `repository` (all when `None`), newest first.
pub fn recent(repository: Option<&Path>) -> Vec<GitActivity> {
    LOG.lock()
        .unwrap_or_else(PoisonError::into_inner)
        .iter()
        .rev()
        .filter(|entry| repository.is_none_or(|path| entry.repository == path))
        .cloned()
        .collect()
}

/// Whether `args` change the repository: not a plain read, a `config --get`
/// or a stash/bisect listing.
fn changes_something(args: &[&str]) -> bool {
    let Some(&verb) = args.first() else {
        return false;
    };
    let reads = READ_ONLY.contains(&verb)
        || (verb == "config" && args.iter().any(|arg| arg.starts_with("--get")))
        || (verb == "stash" && matches!(args.get(1), Some(&("list" | "show"))))
        || (verb == "bisect" && args.get(1) == Some(&"log"));
    !reads
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tells_reads_from_changes() {
        assert!(!changes_something(&["log", "--all"]));
        assert!(!changes_something(&["config", "--get", "user.name"]));
        assert!(!changes_something(&["stash", "list"]));
        assert!(changes_something(&["stash", "push"]));
        assert!(changes_something(&["commit", "--file=-"]));
        assert!(changes_something(&["config", "user.name", "Ada"]));
    }

    #[test]
    fn keeps_the_newest_commands_per_repository() {
        let here = Path::new("C:/activity-test/one");
        let started = Instant::now();
        record(here, &["fetch", "--prune"], started, true, "  done  ");
        record(
            Path::new("C:/activity-test/two"),
            &["status"],
            started,
            true,
            "",
        );
        record(here, &["push"], started, false, "rejected");

        let mine = recent(Some(here));
        assert_eq!(mine[0].command, "git push");
        assert!(!mine[0].succeeded);
        assert_eq!(mine[1].output, "done");
        assert!(mine.iter().all(|entry| entry.repository == here));
    }
}

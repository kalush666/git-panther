//! Clones repositories with the system git, so the user's credential
//! helpers, SSH agent and git config apply unchanged.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::Duration;

use panther_domain::ports::RepositoryCloner;
use panther_domain::repository::{CancellationToken, CloneProgress, CloneRequest, RepositoryError};

use super::background_command;
use super::progress::{forward_lines, parse_progress_line};

/// How often a running clone checks for cancellation.
const CANCEL_POLL_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone)]
pub struct GitCliCloner {
    executable: PathBuf,
}

impl GitCliCloner {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }

    fn spawn(&self, request: &CloneRequest) -> Result<Child, RepositoryError> {
        background_command(&self.executable)
            .args(["clone", "--progress", "--"])
            .arg(request.url.as_str())
            .arg(&request.destination)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| RepositoryError::CloneFailed {
                details: format!("could not start git: {error}"),
            })
    }

    fn run(
        &self,
        request: &CloneRequest,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        let mut child = self.spawn(request)?;
        let stderr = child.stderr.take().expect("stderr is piped in spawn()");
        let (sender, lines) = mpsc::channel();
        let reader = thread::spawn(move || forward_lines(stderr, &sender));

        let mut messages = Vec::new();
        loop {
            if cancel.is_cancelled() {
                stop(&mut child);
                return Err(RepositoryError::Cancelled);
            }
            match lines.recv_timeout(CANCEL_POLL_INTERVAL) {
                Ok(line) => match parse_progress_line(&line) {
                    Some(progress) => on_progress(progress),
                    None => messages.push(line),
                },
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }

        let status = child.wait().map_err(|error| RepositoryError::CloneFailed {
            details: error.to_string(),
        })?;
        // The reader thread has finished: its channel disconnected above.
        let _ = reader.join();
        if status.success() {
            Ok(())
        } else {
            Err(RepositoryError::CloneFailed {
                details: failure_details(&messages),
            })
        }
    }
}

impl Default for GitCliCloner {
    fn default() -> Self {
        Self::new("git")
    }
}

impl RepositoryCloner for GitCliCloner {
    fn clone_repository(
        &self,
        request: &CloneRequest,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        let created_destination = ensure_empty_destination(&request.destination)?;
        let result = self.run(request, on_progress, cancel);
        if result.is_err() && created_destination {
            // Best-effort cleanup of a folder only this clone created; the
            // clone error is what the user needs to see.
            let _ = fs::remove_dir_all(&request.destination);
        }
        result
    }
}

/// Returns `true` when the destination does not exist yet (git will create it).
fn ensure_empty_destination(destination: &Path) -> Result<bool, RepositoryError> {
    match fs::read_dir(destination) {
        Ok(mut entries) => match entries.next() {
            Some(_) => Err(RepositoryError::DestinationNotEmpty {
                path: destination.to_path_buf(),
            }),
            None => Ok(false),
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(RepositoryError::CloneFailed {
            details: format!("cannot use {}: {error}", destination.display()),
        }),
    }
}

fn stop(child: &mut Child) {
    // Killing fails only if git already exited, which is fine either way.
    let _ = child.kill();
    let _ = child.wait();
}

/// Picks git's own explanation (its `fatal:`/`error:` lines) out of stderr.
fn failure_details(messages: &[String]) -> String {
    let explanations: Vec<&str> = messages
        .iter()
        .filter_map(|line| {
            line.strip_prefix("fatal:")
                .or_else(|| line.strip_prefix("error:"))
                .map(str::trim)
        })
        .collect();
    if explanations.is_empty() {
        messages
            .last()
            .cloned()
            .unwrap_or_else(|| "git exited with an error".into())
    } else {
        explanations.join(" ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_fatal_lines_as_failure_details() {
        let messages = [
            "Cloning into 'x'...".to_owned(),
            "fatal: repository 'https://example.com/x' not found".to_owned(),
        ];
        assert_eq!(
            failure_details(&messages),
            "repository 'https://example.com/x' not found"
        );
    }

    #[test]
    fn falls_back_to_last_line() {
        assert_eq!(
            failure_details(&["something odd".to_owned()]),
            "something odd"
        );
        assert_eq!(failure_details(&[]), "git exited with an error");
    }
}

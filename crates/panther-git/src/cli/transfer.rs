//! Runs long git network commands (clone, fetch, pull, push) with live
//! progress and cancellation.

use std::io;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::Duration;

use panther_domain::repository::{CancellationToken, CloneProgress};

use super::progress::{forward_lines, parse_progress_line};

/// How often a running transfer checks for cancellation.
const CANCEL_POLL_INTERVAL: Duration = Duration::from_millis(100);

/// What git printed besides progress, and whether it succeeded.
#[derive(Debug)]
pub struct TransferOutput {
    pub succeeded: bool,
    pub messages: Vec<String>,
}

#[derive(Debug)]
pub enum TransferError {
    Cancelled,
    Io(io::Error),
}

/// Runs `command` (already configured with its arguments), streaming
/// progress from stderr and stopping it if `cancel` is triggered.
///
/// # Errors
/// [`TransferError::Cancelled`] or an I/O error starting or waiting for git.
pub fn run_transfer(
    command: &mut Command,
    on_progress: &mut dyn FnMut(CloneProgress),
    cancel: &CancellationToken,
) -> Result<TransferOutput, TransferError> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(TransferError::Io)?;
    let stderr = child.stderr.take().expect("stderr is piped above");
    let stdout = child.stdout.take().expect("stdout is piped above");
    let (sender, lines) = mpsc::channel();
    let stdout_sender = sender.clone();
    let readers = [
        thread::spawn(move || forward_lines(stderr, &sender)),
        thread::spawn(move || forward_lines(stdout, &stdout_sender)),
    ];

    let mut messages = Vec::new();
    loop {
        if cancel.is_cancelled() {
            stop(&mut child);
            return Err(TransferError::Cancelled);
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

    let status = child.wait().map_err(TransferError::Io)?;
    for reader in readers {
        // Both readers have finished: their channel disconnected above.
        let _ = reader.join();
    }
    Ok(TransferOutput {
        succeeded: status.success(),
        messages,
    })
}

fn stop(child: &mut Child) {
    // Killing fails only if git already exited, which is fine either way.
    let _ = child.kill();
    let _ = child.wait();
}

/// Picks git's own explanation (its `fatal:`/`error:` lines) out of its output.
pub fn failure_details(messages: &[String]) -> String {
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

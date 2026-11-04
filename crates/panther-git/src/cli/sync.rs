//! Fetch, pull and push with the git CLI.

use std::path::Path;

use panther_domain::remote::PullStrategy;
use panther_domain::repository::{CancellationToken, CloneProgress, RepositoryError};

use super::background_command;
use super::transfer::{TransferError, failure_details, run_transfer};

/// Runs `git -C <repository> <args>` as a cancellable transfer.
///
/// # Errors
/// The [`RepositoryError`] matching git's explanation.
pub fn run_sync(
    executable: &Path,
    repository: &Path,
    args: &[&str],
    on_progress: &mut dyn FnMut(CloneProgress),
    cancel: &CancellationToken,
) -> Result<(), RepositoryError> {
    let mut command = background_command(executable);
    command.arg("-C").arg(repository).args(args);
    match run_transfer(&mut command, on_progress, cancel) {
        Ok(output) if output.succeeded => Ok(()),
        Ok(output) => Err(classify(&output.messages)),
        Err(TransferError::Cancelled) => Err(RepositoryError::Cancelled),
        Err(TransferError::Io(error)) => Err(RepositoryError::Git {
            details: format!("could not run git: {error}"),
        }),
    }
}

/// The `git pull` flags for a strategy. Merges never open an editor.
pub fn pull_args(strategy: PullStrategy) -> &'static [&'static str] {
    match strategy {
        PullStrategy::FastForwardOnly => &["pull", "--progress", "--ff-only"],
        PullStrategy::Merge => &["pull", "--progress", "--no-rebase", "--no-edit"],
        PullStrategy::Rebase => &["pull", "--progress", "--rebase"],
    }
}

const AUTHENTICATION_SIGNS: &[&str] = &[
    "authentication failed",
    "could not read username",
    "could not read password",
    "permission denied (publickey",
    "terminal prompts disabled",
    "user interactivity has been disabled",
    "invalid username or password",
    "access denied",
];

const NETWORK_SIGNS: &[&str] = &[
    "could not resolve host",
    "unable to access",
    "connection refused",
    "connection timed out",
    "could not connect",
    "network is unreachable",
    "operation timed out",
];

/// Maps git's wording to the errors the UI explains specifically.
pub fn classify(messages: &[String]) -> RepositoryError {
    let text = messages.join("\n");
    let lower = text.to_lowercase();
    let details = failure_details(messages);
    let any = |signs: &[&str]| signs.iter().any(|sign| lower.contains(sign));

    if any(AUTHENTICATION_SIGNS) {
        RepositoryError::AuthenticationFailed { details }
    } else if any(&[
        "[rejected]",
        "non-fast-forward",
        "fetch first",
        "updates were rejected",
    ]) {
        RepositoryError::PushRejected { details }
    } else if any(&[
        "you have unstaged changes",
        "would be overwritten",
        "please commit your changes or stash them",
    ]) {
        RepositoryError::CheckoutConflict { details }
    } else if any(&["not possible to fast-forward", "diverging branches"]) {
        RepositoryError::NotFastForward
    } else if any(&[
        "conflict",
        "automatic merge failed",
        "could not apply",
        "resolve all conflicts",
    ]) {
        RepositoryError::PullConflict { details }
    } else if any(&["there is no tracking information"]) {
        RepositoryError::NoUpstream {
            branch: "The current branch".into(),
        }
    } else if any(NETWORK_SIGNS) {
        RepositoryError::NetworkFailed { details }
    } else {
        RepositoryError::Git { details }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(text: &str) -> Vec<String> {
        text.lines().map(str::to_owned).collect()
    }

    #[test]
    fn recognizes_authentication_failures() {
        for message in [
            "fatal: Authentication failed for 'https://git.example.internal/x.git/'",
            "fatal: could not read Username for 'https://host': terminal prompts disabled",
            "fatal: Cannot prompt because user interactivity has been disabled.",
            "git@host: Permission denied (publickey).",
        ] {
            assert!(
                matches!(
                    classify(&lines(message)),
                    RepositoryError::AuthenticationFailed { .. }
                ),
                "{message}"
            );
        }
    }

    #[test]
    fn recognizes_network_failures() {
        let message = "fatal: unable to access 'https://host/x.git/': Could not resolve host: host";
        assert!(matches!(
            classify(&lines(message)),
            RepositoryError::NetworkFailed { .. }
        ));
    }

    #[test]
    fn recognizes_rejected_pushes_and_diverged_pulls() {
        let rejected =
            " ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs";
        assert!(matches!(
            classify(&lines(rejected)),
            RepositoryError::PushRejected { .. }
        ));
        assert!(matches!(
            classify(&lines("fatal: Not possible to fast-forward, aborting.")),
            RepositoryError::NotFastForward
        ));
    }

    #[test]
    fn recognizes_uncommitted_changes_blocking_a_pull() {
        let message = "error: cannot pull with rebase: You have unstaged changes.
error: Please commit or stash them.";
        assert!(matches!(
            classify(&lines(message)),
            RepositoryError::CheckoutConflict { .. }
        ));
    }

    #[test]
    fn recognizes_conflicts() {
        let message = "CONFLICT (content): Merge conflict in notes.txt\nAutomatic merge failed; fix conflicts and then commit the result.";
        assert!(matches!(
            classify(&lines(message)),
            RepositoryError::PullConflict { .. }
        ));
    }
}

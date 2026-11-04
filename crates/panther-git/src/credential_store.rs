//! The production [`CredentialStore`]: hands credentials to the user's git
//! credential helper through `git credential`, so git uses them for every
//! HTTPS operation and Git Panther never keeps a password.

use std::ffi::OsString;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use panther_domain::account::{Account, Password, Server};
use panther_domain::ports::CredentialStore;
use panther_domain::repository::RepositoryError;

use crate::cli::{background_command, classify_sync_failure};

#[derive(Debug, Clone)]
pub struct GitCredentialStore {
    executable: PathBuf,
    environment: Vec<(OsString, OsString)>,
}

impl GitCredentialStore {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
            environment: Vec::new(),
        }
    }

    /// Runs git with an extra environment variable, e.g. `GIT_CONFIG_GLOBAL`
    /// for a portable git or an isolated test configuration.
    #[must_use]
    pub fn with_env(mut self, key: impl Into<OsString>, value: impl Into<OsString>) -> Self {
        self.environment.push((key.into(), value.into()));
        self
    }

    fn command(&self) -> Command {
        let mut command = background_command(&self.executable);
        command.envs(self.environment.iter().map(|(key, value)| (key, value)));
        command
    }

    /// Runs `git credential <action>` with `description` on stdin.
    fn credential(&self, action: &str, description: &str) -> Result<(), RepositoryError> {
        self.credential_output(action, description).map(drop)
    }

    /// [`Self::credential`], returning what git printed.
    fn credential_output(
        &self,
        action: &str,
        description: &str,
    ) -> Result<String, RepositoryError> {
        let mut child = self
            .command()
            // Asking for a missing token must fail, not open a sign-in window.
            .env("GCM_INTERACTIVE", "never")
            .args(["credential", action])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| git_failed(format!("could not start git: {error}")))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(description.as_bytes())
                .map_err(|error| git_failed(format!("could not talk to git: {error}")))?;
        }
        let output = child
            .wait_with_output()
            .map_err(|error| git_failed(format!("git stopped unexpectedly: {error}")))?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).into_owned())
        } else {
            Err(git_failed(
                String::from_utf8_lossy(&output.stderr).trim().to_owned(),
            ))
        }
    }
}

impl Default for GitCredentialStore {
    fn default() -> Self {
        Self::new("git")
    }
}

fn git_failed(details: String) -> RepositoryError {
    RepositoryError::Git { details }
}

/// The user name API tokens are filed under, apart from the git login.
const TOKEN_USER: &str = "git-panther-api-token";

/// The lines of git's credential protocol naming the token of `server`.
fn describe_token(server: &Server) -> String {
    format!(
        "protocol={}\nhost={}\nusername={TOKEN_USER}\n",
        server.protocol(),
        server.host()
    )
}

/// The lines of git's credential protocol naming `account`.
fn describe(account: &Account) -> String {
    format!(
        "protocol={}\nhost={}\nusername={}\n",
        account.server.protocol(),
        account.server.host(),
        account.username
    )
}

impl CredentialStore for GitCredentialStore {
    fn has_helper(&self) -> Result<bool, RepositoryError> {
        let output = self
            .command()
            .args(["config", "--get-all", "credential.helper"])
            .output()
            .map_err(|error| git_failed(format!("could not start git: {error}")))?;
        // Exit code 1 just means the key is not set.
        Ok(output.status.success() && !String::from_utf8_lossy(&output.stdout).trim().is_empty())
    }

    fn store(&self, account: &Account, password: &Password) -> Result<(), RepositoryError> {
        let description = format!("{}password={}\n\n", describe(account), password.expose());
        self.credential("approve", &description)
    }

    fn erase(&self, account: &Account) -> Result<(), RepositoryError> {
        self.credential("reject", &format!("{}\n", describe(account)))
    }

    fn store_token(&self, server: &Server, token: &Password) -> Result<(), RepositoryError> {
        if !self.has_helper()? {
            return Err(RepositoryError::CredentialHelperMissing);
        }
        let description = format!("{}password={}\n\n", describe_token(server), token.expose());
        self.credential("approve", &description)
    }

    fn token(&self, server: &Server) -> Result<Option<Password>, RepositoryError> {
        let Ok(output) = self.credential_output("fill", &format!("{}\n", describe_token(server)))
        else {
            return Ok(None);
        };
        Ok(output
            .lines()
            .find_map(|line| line.strip_prefix("password="))
            .and_then(|token| Password::new(token.to_owned()).ok()))
    }

    fn erase_token(&self, server: &Server) -> Result<(), RepositoryError> {
        self.credential("reject", &format!("{}\n", describe_token(server)))
    }

    fn verify(&self, url: &str) -> Result<(), RepositoryError> {
        let output = self
            .command()
            // Fail instead of asking again in a window if the credentials are wrong.
            .env("GCM_INTERACTIVE", "never")
            .args(["ls-remote", "--heads", "--", url])
            .stdin(Stdio::null())
            .output()
            .map_err(|error| git_failed(format!("could not start git: {error}")))?;
        if output.status.success() {
            return Ok(());
        }
        let messages: Vec<String> = String::from_utf8_lossy(&output.stderr)
            .lines()
            .map(str::to_owned)
            .collect();
        Err(classify_sync_failure(&messages))
    }
}

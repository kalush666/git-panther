//! Accounts on git servers reached over HTTPS, e.g. a self-hosted GitLab
//! signed into with a personal number and password.
//!
//! Git Panther never keeps passwords: they go straight to the user's git
//! credential helper (Git Credential Manager on Windows).

use std::fmt;

/// The part of a URL git matches credentials on: scheme and host (with port).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Server {
    protocol: String,
    host: String,
}

/// The input could not be read as an `https://` (or `http://`) server.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("\"{input}\" is not a server address. Enter it like https://gitlab.example.internal")]
pub struct InvalidServer {
    pub input: String,
}

impl Server {
    /// Reads a server from a server address or any HTTPS repository URL on
    /// it. A bare host name means HTTPS.
    ///
    /// # Errors
    /// [`InvalidServer`] for other schemes (SSH needs keys, not a password)
    /// or a missing host.
    pub fn parse(input: &str) -> Result<Self, InvalidServer> {
        let invalid = || InvalidServer {
            input: input.to_owned(),
        };
        let trimmed = input.trim();
        let (protocol, rest) = match trimmed.split_once("://") {
            Some((scheme, rest)) => (scheme.to_ascii_lowercase(), rest),
            None => ("https".to_owned(), trimmed),
        };
        if protocol != "https" && protocol != "http" {
            return Err(invalid());
        }
        let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
        // Drop any `user@` part; the account names the user.
        let host = authority
            .rsplit_once('@')
            .map_or(authority, |(_, host)| host)
            .to_ascii_lowercase();
        let valid = !host.is_empty()
            && host
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':' | '[' | ']'));
        if valid {
            Ok(Self { protocol, host })
        } else {
            Err(invalid())
        }
    }

    pub fn protocol(&self) -> &str {
        &self.protocol
    }

    /// Host name, with `:port` when not the default.
    pub fn host(&self) -> &str {
        &self.host
    }
}

impl fmt::Display for Server {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}://{}", self.protocol, self.host)
    }
}

/// A user signed in to a server. Holds no secret.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Account {
    pub server: Server,
    pub username: String,
}

/// A password on its way to the credential helper. Never printed.
#[derive(Clone)]
pub struct Password(String);

/// Why a username or password cannot be handed to git.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum InvalidCredentials {
    #[error("Enter your user name or personal number.")]
    MissingUsername,
    #[error("Enter your password.")]
    MissingPassword,
    /// Git's credential protocol is line based.
    #[error("User names and passwords cannot contain line breaks.")]
    LineBreak,
}

impl Password {
    /// # Errors
    /// [`InvalidCredentials`] for an empty password or one with line breaks.
    pub fn new(password: String) -> Result<Self, InvalidCredentials> {
        if password.is_empty() {
            Err(InvalidCredentials::MissingPassword)
        } else if has_line_break(&password) {
            Err(InvalidCredentials::LineBreak)
        } else {
            Ok(Self(password))
        }
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Password {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Password(***)")
    }
}

fn has_line_break(text: &str) -> bool {
    text.contains(['\n', '\r', '\0'])
}

/// Validates a user name such as `p9493378`.
///
/// # Errors
/// [`InvalidCredentials`] for an empty name or one with line breaks.
pub fn parse_username(input: &str) -> Result<String, InvalidCredentials> {
    let username = input.trim();
    if username.is_empty() {
        Err(InvalidCredentials::MissingUsername)
    } else if has_line_break(username) {
        Err(InvalidCredentials::LineBreak)
    } else {
        Ok(username.to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_servers_from_addresses_and_repository_urls() {
        for input in [
            "https://gitlab.example.internal",
            "gitlab.example.internal",
            "https://GitLab.Example.Internal/team/app.git",
            "https://p9493378@gitlab.example.internal/team/app.git",
        ] {
            let server = Server::parse(input).unwrap();
            assert_eq!(
                server.to_string(),
                "https://gitlab.example.internal",
                "{input}"
            );
        }
        assert_eq!(
            Server::parse("http://git.local:8080/x").unwrap().host(),
            "git.local:8080"
        );
    }

    #[test]
    fn refuses_ssh_and_empty_servers() {
        for input in [
            "ssh://git@gitlab.example.internal/x.git",
            "",
            "https://",
            "file:///c/repo",
        ] {
            assert!(Server::parse(input).is_err(), "{input}");
        }
    }

    #[test]
    fn refuses_unusable_credentials_and_hides_passwords() {
        assert_eq!(
            parse_username("  "),
            Err(InvalidCredentials::MissingUsername)
        );
        assert_eq!(
            parse_username("p94\n93378"),
            Err(InvalidCredentials::LineBreak)
        );
        assert_eq!(parse_username(" p9493378 ").unwrap(), "p9493378");
        assert!(Password::new(String::new()).is_err());
        let password = Password::new("s3cret".into()).unwrap();
        assert_eq!(format!("{password:?}"), "Password(***)");
    }
}

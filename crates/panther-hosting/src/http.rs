//! A small blocking JSON client shared by the providers.

use std::time::Duration;

use panther_domain::repository::RepositoryError;
use reqwest::StatusCode;
use reqwest::blocking::{Client, RequestBuilder, Response};
use serde::de::DeserializeOwned;

/// Long enough for a slow internal server, short enough not to hang the UI.
const TIMEOUT: Duration = Duration::from_secs(20);

pub fn client() -> Client {
    Client::builder()
        .timeout(TIMEOUT)
        .user_agent(concat!("Git Panther/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("the HTTP client builds with static settings")
}

/// Sends `request` and reads a JSON answer, mapping failures for `server`.
///
/// # Errors
/// [`RepositoryError::HostingUnauthorized`] for 401/403,
/// [`RepositoryError::NetworkFailed`] when the server cannot be reached, or
/// [`RepositoryError::HostingFailed`] with the server's explanation.
pub fn json<T: DeserializeOwned>(
    request: RequestBuilder,
    server: &str,
) -> Result<T, RepositoryError> {
    let response = request
        .send()
        .map_err(|error| RepositoryError::NetworkFailed {
            details: error.to_string(),
        })?;
    checked(response, server)?
        .json()
        .map_err(|error| RepositoryError::HostingFailed {
            details: format!("unexpected answer: {error}"),
        })
}

/// The response when it succeeded.
///
/// # Errors
/// As [`json`].
pub fn checked(response: Response, server: &str) -> Result<Response, RepositoryError> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    if matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
        return Err(RepositoryError::HostingUnauthorized {
            server: server.to_owned(),
        });
    }
    let body = response.text().unwrap_or_default();
    Err(RepositoryError::HostingFailed {
        details: format!("{status}: {}", explanation(&body)),
    })
}

/// The human part of an API error body (`message` / `error`), or the body.
fn explanation(body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| {
            ["message", "error"]
                .iter()
                .find_map(|key| match &value[key] {
                    serde_json::Value::Null => None,
                    serde_json::Value::String(text) => Some(text.clone()),
                    other => Some(other.to_string()),
                })
        })
        .unwrap_or_else(|| body.chars().take(200).collect())
}

/// `group/app` as one URL path segment: `group%2Fapp`.
pub fn encode_path(path: &str) -> String {
    path.bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                char::from(byte).to_string()
            }
            other => format!("%{other:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_project_paths_and_reads_error_messages() {
        assert_eq!(
            encode_path("team/sub group/app"),
            "team%2Fsub%20group%2Fapp"
        );
        assert_eq!(
            explanation(r#"{"message":["Another open merge request already exists"]}"#),
            r#"["Another open merge request already exists"]"#
        );
        assert_eq!(explanation("plain text"), "plain text");
    }
}

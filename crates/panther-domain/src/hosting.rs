//! Self-hosted code review servers (GitLab self-managed, GitHub Enterprise
//! Server): merge / pull requests and issues of a repository's project.

use crate::account::Server;

/// Which API a server speaks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HostingKind {
    GitLab,
    GitHub,
}

/// A server the user connected with an access token. The token itself
/// lives in the credential helper.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostingAccess {
    pub server: Server,
    pub kind: HostingKind,
}

/// A repository on a hosting server, e.g. `team/app` on
/// `https://gitlab.example.internal`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostedProject {
    pub server: Server,
    /// `group/subgroup/name`, without `.git`.
    pub path: String,
}

impl HostedProject {
    /// Reads the server and project from a remote URL: `https://host/group/app.git`,
    /// `git@host:group/app.git` or `ssh://git@host:2222/group/app.git` (the API
    /// is then assumed on `https://host`).
    pub fn from_remote_url(url: &str) -> Option<Self> {
        let url = url.trim();
        let (server, path) = if let Some((_, rest)) = url.split_once("://") {
            let (authority, path) = rest.split_once('/')?;
            let host = authority
                .rsplit_once('@')
                .map_or(authority, |(_, host)| host);
            let server = if url.starts_with("http") {
                Server::parse(&format!("{}://{host}", url.split_once("://")?.0)).ok()?
            } else {
                // An SSH port is not the web port.
                Server::parse(host.split(':').next()?).ok()?
            };
            (server, path)
        } else {
            // scp-like syntax: user@host:path
            let (authority, path) = url.split_once(':')?;
            let host = authority
                .rsplit_once('@')
                .map_or(authority, |(_, host)| host);
            // `C:/repos/app.git` is a Windows path, not host `C`.
            if host.len() < 2 {
                return None;
            }
            (Server::parse(host).ok()?, path)
        };
        let path = path.trim_matches('/');
        let path = path.strip_suffix(".git").unwrap_or(path);
        (path.contains('/') && !path.contains(char::is_whitespace)).then(|| Self {
            server,
            path: path.to_owned(),
        })
    }
}

/// A merge request (GitLab) or pull request (GitHub).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PullRequest {
    pub number: u64,
    pub title: String,
    pub author: String,
    pub source_branch: String,
    pub target_branch: String,
    pub url: String,
    pub draft: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewPullRequest {
    pub source_branch: String,
    pub target_branch: String,
    pub title: String,
    pub description: String,
}

/// What reviewing a request shows besides its changes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PullRequestReview {
    pub description: String,
    /// Who approved it, by display name.
    pub approved_by: Vec<String>,
    /// Oldest first; the server's own system notes are left out.
    pub comments: Vec<ReviewComment>,
    /// The server would merge it now (no conflicts, nothing blocking).
    pub mergeable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReviewComment {
    pub author: String,
    pub body: String,
    /// As the server wrote it (RFC 3339).
    pub created_at: String,
    /// For a comment on a line of the changes: the file and its line.
    pub file: Option<String>,
    pub line: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Issue {
    pub number: u64,
    pub title: String,
    pub author: String,
    pub url: String,
    pub labels: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_projects_from_every_remote_url_style() {
        for url in [
            "https://gitlab.example.internal/team/app.git",
            "https://p9493378@gitlab.example.internal/team/app",
            "git@gitlab.example.internal:team/app.git",
            "ssh://git@gitlab.example.internal:2222/team/app.git",
        ] {
            let project = HostedProject::from_remote_url(url).unwrap();
            assert_eq!(
                project.server.to_string(),
                "https://gitlab.example.internal",
                "{url}"
            );
            assert_eq!(project.path, "team/app", "{url}");
        }
        assert_eq!(
            HostedProject::from_remote_url("https://git.local/a/b/c.git")
                .unwrap()
                .path,
            "a/b/c"
        );
    }

    #[test]
    fn ignores_local_and_malformed_remotes() {
        for url in ["/srv/repos/app.git", "C:/repos/app.git", "https://host/app"] {
            assert_eq!(HostedProject::from_remote_url(url), None, "{url}");
        }
    }
}

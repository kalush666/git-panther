//! GitLab self-managed: merge requests and issues through REST API v4.

use panther_domain::account::{Account, Password, Server};
use panther_domain::hosting::{HostedProject, Issue, NewPullRequest, PullRequest};
use panther_domain::ports::HostingProvider;
use panther_domain::repository::RepositoryError;
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::json;

use crate::http::{client, encode_path, json};

/// Answers of `/oauth/token` that mean "not with these credentials" rather
/// than a broken server.
const REFUSED: [u16; 3] = [400, 401, 403];

/// Talks to `<server>/api/v4` with a personal access token, or with an OAuth
/// token traded for the user's git sign-in.
pub struct GitLabProvider {
    client: Client,
}

impl Default for GitLabProvider {
    fn default() -> Self {
        Self { client: client() }
    }
}

#[derive(Deserialize)]
struct Author {
    name: String,
}

#[derive(Deserialize)]
struct MergeRequest {
    iid: u64,
    title: String,
    author: Author,
    source_branch: String,
    target_branch: String,
    web_url: String,
    #[serde(default)]
    draft: bool,
}

impl From<MergeRequest> for PullRequest {
    fn from(request: MergeRequest) -> Self {
        Self {
            number: request.iid,
            title: request.title,
            author: request.author.name,
            source_branch: request.source_branch,
            target_branch: request.target_branch,
            url: request.web_url,
            draft: request.draft,
        }
    }
}

#[derive(Deserialize)]
struct OAuthToken {
    access_token: String,
}

#[derive(Deserialize)]
struct GitLabIssue {
    iid: u64,
    title: String,
    author: Author,
    web_url: String,
    #[serde(default)]
    labels: Vec<String>,
}

impl GitLabProvider {
    fn api(server: &Server, path: &str) -> String {
        format!("{server}/api/v4{path}")
    }

    fn project(project: &HostedProject, path: &str) -> String {
        Self::api(
            &project.server,
            &format!("/projects/{}{path}", encode_path(&project.path)),
        )
    }
}

impl HostingProvider for GitLabProvider {
    fn token_from_login(
        &self,
        account: &Account,
        password: &Password,
    ) -> Result<Option<Password>, RepositoryError> {
        let response = self
            .client
            .post(format!("{}/oauth/token", account.server))
            .form(&[
                ("grant_type", "password"),
                ("username", account.username.as_str()),
                ("password", password.expose()),
                ("scope", "api"),
            ])
            .send()
            .map_err(|error| RepositoryError::NetworkFailed {
                details: error.to_string(),
            })?;
        // Refused credentials, or the password grant is turned off.
        if REFUSED.contains(&response.status().as_u16()) {
            return Ok(None);
        }
        let token: OAuthToken = crate::http::checked(response, &account.server.to_string())?
            .json()
            .map_err(|error| RepositoryError::HostingFailed {
                details: format!("unexpected answer: {error}"),
            })?;
        Ok(Password::new(token.access_token).ok())
    }

    fn check(&self, server: &Server, token: &Password) -> Result<(), RepositoryError> {
        let request = self
            .client
            .get(Self::api(server, "/user"))
            .bearer_auth(token.expose());
        json::<serde_json::Value>(request, &server.to_string()).map(drop)
    }

    fn pull_requests(
        &self,
        project: &HostedProject,
        token: &Password,
    ) -> Result<Vec<PullRequest>, RepositoryError> {
        let request = self
            .client
            .get(Self::project(
                project,
                "/merge_requests?state=opened&per_page=100",
            ))
            .bearer_auth(token.expose());
        let requests: Vec<MergeRequest> = json(request, &project.server.to_string())?;
        Ok(requests.into_iter().map(PullRequest::from).collect())
    }

    fn create_pull_request(
        &self,
        project: &HostedProject,
        token: &Password,
        new: &NewPullRequest,
    ) -> Result<PullRequest, RepositoryError> {
        let request = self
            .client
            .post(Self::project(project, "/merge_requests"))
            .bearer_auth(token.expose())
            .json(&json!({
                "source_branch": new.source_branch,
                "target_branch": new.target_branch,
                "title": new.title,
                "description": new.description,
                "remove_source_branch": true,
            }));
        let created: MergeRequest = json(request, &project.server.to_string())?;
        Ok(created.into())
    }

    fn issues(
        &self,
        project: &HostedProject,
        token: &Password,
    ) -> Result<Vec<Issue>, RepositoryError> {
        let request = self
            .client
            .get(Self::project(project, "/issues?state=opened&per_page=100"))
            .bearer_auth(token.expose());
        let issues: Vec<GitLabIssue> = json(request, &project.server.to_string())?;
        Ok(issues
            .into_iter()
            .map(|issue| Issue {
                number: issue.iid,
                title: issue.title,
                author: issue.author.name,
                url: issue.web_url,
                labels: issue.labels,
            })
            .collect())
    }
}

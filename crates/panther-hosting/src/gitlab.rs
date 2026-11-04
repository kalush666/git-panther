//! GitLab self-managed: merge requests and issues through REST API v4.

use panther_domain::account::{Password, Server};
use panther_domain::hosting::{HostedProject, Issue, NewPullRequest, PullRequest};
use panther_domain::ports::HostingProvider;
use panther_domain::repository::RepositoryError;
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::json;

use crate::http::{client, encode_path, json};

/// Talks to `<server>/api/v4` with a personal access token.
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
    fn check(&self, server: &Server, token: &Password) -> Result<(), RepositoryError> {
        let request = self
            .client
            .get(Self::api(server, "/user"))
            .header("PRIVATE-TOKEN", token.expose());
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
            .header("PRIVATE-TOKEN", token.expose());
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
            .header("PRIVATE-TOKEN", token.expose())
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
            .header("PRIVATE-TOKEN", token.expose());
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

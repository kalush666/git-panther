//! GitLab self-managed: merge requests and issues through REST API v4.

use panther_domain::account::{Account, Password, Server};
use panther_domain::hosting::{
    HostedProject, Issue, NewPullRequest, Pipeline, PipelineState, PullRequest, PullRequestReview,
    ReviewComment,
};
use panther_domain::ports::HostingProvider;
use panther_domain::repository::RepositoryError;
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::json;

use crate::http::{client, encode_path, json, newest_per_commit, send};

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
struct GitLabPipeline {
    sha: String,
    status: String,
    web_url: String,
}

#[derive(Deserialize)]
struct MergeRequestState {
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    detailed_merge_status: Option<String>,
    #[serde(default)]
    merge_status: Option<String>,
}

#[derive(Deserialize)]
struct Approvals {
    #[serde(default)]
    approved_by: Vec<Approver>,
}

#[derive(Deserialize)]
struct Approver {
    user: Author,
}

#[derive(Deserialize)]
struct Note {
    body: String,
    author: Author,
    created_at: String,
    #[serde(default)]
    system: bool,
    #[serde(default)]
    position: Option<NotePosition>,
}

#[derive(Deserialize)]
struct NotePosition {
    new_path: Option<String>,
    new_line: Option<u32>,
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

    fn merge_request(project: &HostedProject, number: u64, path: &str) -> String {
        Self::project(project, &format!("/merge_requests/{number}{path}"))
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

    fn pipelines(
        &self,
        project: &HostedProject,
        token: &Password,
    ) -> Result<Vec<Pipeline>, RepositoryError> {
        let request = self
            .client
            .get(Self::project(project, "/pipelines?per_page=100"))
            .bearer_auth(token.expose());
        let pipelines: Vec<GitLabPipeline> = json(request, &project.server.to_string())?;
        Ok(newest_per_commit(pipelines.into_iter().map(|pipeline| {
            Pipeline {
                commit: pipeline.sha,
                state: PipelineState::from_gitlab(&pipeline.status),
                url: pipeline.web_url,
            }
        })))
    }

    fn review(
        &self,
        project: &HostedProject,
        token: &Password,
        number: u64,
    ) -> Result<PullRequestReview, RepositoryError> {
        let server = project.server.to_string();
        let get = |path: &str| {
            self.client
                .get(Self::merge_request(project, number, path))
                .bearer_auth(token.expose())
        };
        let state: MergeRequestState = json(get(""), &server)?;
        // Approvals are missing on some editions; the review still shows.
        let approvals: Approvals = json(get("/approvals"), &server).unwrap_or(Approvals {
            approved_by: Vec::new(),
        });
        let notes: Vec<Note> = json(
            get("/notes?sort=asc&order_by=created_at&per_page=100"),
            &server,
        )?;
        let mergeable = state.detailed_merge_status.as_deref() == Some("mergeable")
            || state.merge_status.as_deref() == Some("can_be_merged");
        Ok(PullRequestReview {
            description: state.description.unwrap_or_default(),
            approved_by: approvals
                .approved_by
                .into_iter()
                .map(|approver| approver.user.name)
                .collect(),
            comments: notes
                .into_iter()
                .filter(|note| !note.system)
                .map(|note| {
                    let (file, line) = note.position.map_or((None, None), |position| {
                        (position.new_path, position.new_line)
                    });
                    ReviewComment {
                        author: note.author.name,
                        body: note.body,
                        created_at: note.created_at,
                        file,
                        line,
                    }
                })
                .collect(),
            mergeable,
        })
    }

    fn comment(
        &self,
        project: &HostedProject,
        token: &Password,
        number: u64,
        body: &str,
    ) -> Result<(), RepositoryError> {
        let request = self
            .client
            .post(Self::merge_request(project, number, "/notes"))
            .bearer_auth(token.expose())
            .json(&json!({ "body": body }));
        send(request, &project.server.to_string())
    }

    fn approve(
        &self,
        project: &HostedProject,
        token: &Password,
        number: u64,
    ) -> Result<(), RepositoryError> {
        let request = self
            .client
            .post(Self::merge_request(project, number, "/approve"))
            .bearer_auth(token.expose());
        send(request, &project.server.to_string())
    }

    fn merge(
        &self,
        project: &HostedProject,
        token: &Password,
        number: u64,
    ) -> Result<(), RepositoryError> {
        let request = self
            .client
            .put(Self::merge_request(project, number, "/merge"))
            .bearer_auth(token.expose());
        send(request, &project.server.to_string())
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

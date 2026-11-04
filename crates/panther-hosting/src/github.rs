//! GitHub Enterprise Server: pull requests and issues through REST API v3.

use panther_domain::account::{Account, Password, Server};
use panther_domain::hosting::{
    HostedProject, Issue, NewPullRequest, Pipeline, PipelineState, PullRequest, PullRequestReview,
    ReviewComment,
};
use panther_domain::ports::HostingProvider;
use panther_domain::repository::RepositoryError;
use reqwest::blocking::{Client, RequestBuilder};
use serde::Deserialize;
use serde_json::json;

use crate::http::{client, json, newest_per_commit, send};

/// Talks to `<server>/api/v3` with a personal access token.
pub struct GitHubProvider {
    client: Client,
}

impl Default for GitHubProvider {
    fn default() -> Self {
        Self { client: client() }
    }
}

#[derive(Deserialize)]
struct User {
    login: String,
}

#[derive(Deserialize)]
struct BranchRef {
    #[serde(rename = "ref")]
    name: String,
}

#[derive(Deserialize)]
struct Pull {
    number: u64,
    title: String,
    user: User,
    head: BranchRef,
    base: BranchRef,
    html_url: String,
    #[serde(default)]
    draft: bool,
}

impl From<Pull> for PullRequest {
    fn from(pull: Pull) -> Self {
        Self {
            number: pull.number,
            title: pull.title,
            author: pull.user.login,
            source_branch: pull.head.name,
            target_branch: pull.base.name,
            url: pull.html_url,
            draft: pull.draft,
        }
    }
}

#[derive(Deserialize)]
struct WorkflowRuns {
    workflow_runs: Vec<WorkflowRun>,
}

#[derive(Deserialize)]
struct WorkflowRun {
    head_sha: String,
    status: String,
    conclusion: Option<String>,
    html_url: String,
}

#[derive(Deserialize)]
struct PullState {
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    mergeable: Option<bool>,
}

#[derive(Deserialize)]
struct Review {
    user: User,
    state: String,
}

#[derive(Deserialize)]
struct Comment {
    user: User,
    body: String,
    created_at: String,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    line: Option<u32>,
}

impl From<Comment> for ReviewComment {
    fn from(comment: Comment) -> Self {
        Self {
            author: comment.user.login,
            body: comment.body,
            created_at: comment.created_at,
            file: comment.path,
            line: comment.line,
        }
    }
}

#[derive(Deserialize)]
struct Label {
    name: String,
}

#[derive(Deserialize)]
struct GitHubIssue {
    number: u64,
    title: String,
    user: User,
    html_url: String,
    #[serde(default)]
    labels: Vec<Label>,
    /// Present when the "issue" is really a pull request.
    pull_request: Option<serde_json::Value>,
}

impl GitHubProvider {
    fn get(&self, server: &Server, path: &str, token: &Password) -> RequestBuilder {
        authorized(self.client.get(format!("{server}/api/v3{path}")), token)
    }

    fn repo(project: &HostedProject, path: &str) -> String {
        format!("{}/api/v3/repos/{}{path}", project.server, project.path)
    }
}

fn authorized(request: RequestBuilder, token: &Password) -> RequestBuilder {
    request
        .bearer_auth(token.expose())
        .header("Accept", "application/vnd.github+json")
}

impl HostingProvider for GitHubProvider {
    fn token_from_login(
        &self,
        _account: &Account,
        _password: &Password,
    ) -> Result<Option<Password>, RepositoryError> {
        // GitHub's API takes no passwords; it always needs an access token.
        Ok(None)
    }

    fn check(&self, server: &Server, token: &Password) -> Result<(), RepositoryError> {
        json::<serde_json::Value>(self.get(server, "/user", token), &server.to_string()).map(drop)
    }

    fn pull_requests(
        &self,
        project: &HostedProject,
        token: &Password,
    ) -> Result<Vec<PullRequest>, RepositoryError> {
        let path = format!("/repos/{}/pulls?state=open&per_page=100", project.path);
        let pulls: Vec<Pull> = json(
            self.get(&project.server, &path, token),
            &project.server.to_string(),
        )?;
        Ok(pulls.into_iter().map(PullRequest::from).collect())
    }

    fn create_pull_request(
        &self,
        project: &HostedProject,
        token: &Password,
        new: &NewPullRequest,
    ) -> Result<PullRequest, RepositoryError> {
        let url = format!("{}/api/v3/repos/{}/pulls", project.server, project.path);
        let request = authorized(self.client.post(url), token).json(&json!({
            "head": new.source_branch,
            "base": new.target_branch,
            "title": new.title,
            "body": new.description,
        }));
        let created: Pull = json(request, &project.server.to_string())?;
        Ok(created.into())
    }

    fn pipelines(
        &self,
        project: &HostedProject,
        token: &Password,
    ) -> Result<Vec<Pipeline>, RepositoryError> {
        let path = format!("/repos/{}/actions/runs?per_page=100", project.path);
        let runs: WorkflowRuns = json(
            self.get(&project.server, &path, token),
            &project.server.to_string(),
        )?;
        Ok(newest_per_commit(runs.workflow_runs.into_iter().map(
            |run| Pipeline {
                state: PipelineState::from_github(&run.status, run.conclusion.as_deref()),
                commit: run.head_sha,
                url: run.html_url,
            },
        )))
    }

    fn review(
        &self,
        project: &HostedProject,
        token: &Password,
        number: u64,
    ) -> Result<PullRequestReview, RepositoryError> {
        let server = project.server.to_string();
        let get = |path: String| authorized(self.client.get(Self::repo(project, &path)), token);
        let state: PullState = json(get(format!("/pulls/{number}")), &server)?;
        let reviews: Vec<Review> = json(get(format!("/pulls/{number}/reviews")), &server)?;
        let mut comments: Vec<Comment> = json(
            get(format!("/issues/{number}/comments?per_page=100")),
            &server,
        )?;
        let on_lines: Vec<Comment> = json(
            get(format!("/pulls/{number}/comments?per_page=100")),
            &server,
        )?;
        comments.extend(on_lines);
        // RFC 3339 in UTC sorts as text.
        comments.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        Ok(PullRequestReview {
            description: state.body.unwrap_or_default(),
            approved_by: reviews
                .into_iter()
                .filter(|review| review.state == "APPROVED")
                .map(|review| review.user.login)
                .collect(),
            comments: comments.into_iter().map(ReviewComment::from).collect(),
            mergeable: state.mergeable.unwrap_or(false),
        })
    }

    fn comment(
        &self,
        project: &HostedProject,
        token: &Password,
        number: u64,
        body: &str,
    ) -> Result<(), RepositoryError> {
        let url = Self::repo(project, &format!("/issues/{number}/comments"));
        let request = authorized(self.client.post(url), token).json(&json!({ "body": body }));
        send(request, &project.server.to_string())
    }

    fn approve(
        &self,
        project: &HostedProject,
        token: &Password,
        number: u64,
    ) -> Result<(), RepositoryError> {
        let url = Self::repo(project, &format!("/pulls/{number}/reviews"));
        let request = authorized(self.client.post(url), token).json(&json!({ "event": "APPROVE" }));
        send(request, &project.server.to_string())
    }

    fn merge(
        &self,
        project: &HostedProject,
        token: &Password,
        number: u64,
    ) -> Result<(), RepositoryError> {
        let url = Self::repo(project, &format!("/pulls/{number}/merge"));
        send(
            authorized(self.client.put(url), token),
            &project.server.to_string(),
        )
    }

    fn issues(
        &self,
        project: &HostedProject,
        token: &Password,
    ) -> Result<Vec<Issue>, RepositoryError> {
        let path = format!("/repos/{}/issues?state=open&per_page=100", project.path);
        let issues: Vec<GitHubIssue> = json(
            self.get(&project.server, &path, token),
            &project.server.to_string(),
        )?;
        Ok(issues
            .into_iter()
            .filter(|issue| issue.pull_request.is_none())
            .map(|issue| Issue {
                number: issue.number,
                title: issue.title,
                author: issue.user.login,
                url: issue.html_url,
                labels: issue.labels.into_iter().map(|label| label.name).collect(),
            })
            .collect())
    }
}

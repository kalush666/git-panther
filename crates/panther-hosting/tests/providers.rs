//! Integration tests for the providers against a local fake API server.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::thread;

use panther_domain::account::{Password, Server};
use panther_domain::hosting::{HostedProject, NewPullRequest};
use panther_domain::ports::HostingProvider;
use panther_domain::repository::RepositoryError;
use panther_hosting::{GitHubProvider, GitLabProvider};

/// What the fake server received: request line, headers and body.
#[derive(Debug, Clone)]
struct Received {
    line: String,
    headers: Vec<String>,
    body: String,
}

/// Serves each request with the first route whose path prefix matches.
fn serve(routes: Vec<(&'static str, u16, &'static str)>) -> (Server, Arc<Mutex<Vec<Received>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let received = Arc::new(Mutex::new(Vec::new()));
    let log = Arc::clone(&received);
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            let mut headers = Vec::new();
            let mut length = 0;
            loop {
                let mut header = String::new();
                reader.read_line(&mut header).unwrap();
                let header = header.trim_end().to_owned();
                if header.is_empty() {
                    break;
                }
                if let Some(value) = header.to_lowercase().strip_prefix("content-length: ") {
                    length = value.parse().unwrap();
                }
                headers.push(header);
            }
            let mut body = vec![0; length];
            reader.read_exact(&mut body).unwrap();
            let path = line
                .split_whitespace()
                .nth(1)
                .unwrap_or_default()
                .to_owned();
            let (status, reply) = routes
                .iter()
                .find(|(prefix, _, _)| path.starts_with(prefix))
                .map_or(
                    (404, "{\"message\":\"404 Not Found\"}"),
                    |(_, status, reply)| (*status, *reply),
                );
            log.lock().unwrap().push(Received {
                line: line.trim_end().to_owned(),
                headers,
                body: String::from_utf8(body).unwrap(),
            });
            let response = format!(
                "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{reply}",
                reply.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
        }
    });
    (
        Server::parse(&format!("http://{address}")).unwrap(),
        received,
    )
}

fn token() -> Password {
    Password::new("glpat-secret".into()).unwrap()
}

fn project(server: &Server) -> HostedProject {
    HostedProject {
        server: server.clone(),
        path: "team/app".into(),
    }
}

#[test]
fn gitlab_lists_merge_requests_and_issues_with_the_token() {
    let (server, received) = serve(vec![
        (
            "/api/v4/projects/team%2Fapp/merge_requests",
            200,
            r#"[{"iid":7,"title":"Add login","author":{"name":"Dana"},"source_branch":"feature/login","target_branch":"main","web_url":"http://x/7","draft":true}]"#,
        ),
        (
            "/api/v4/projects/team%2Fapp/issues",
            200,
            r#"[{"iid":3,"title":"Crash on start","author":{"name":"Sam"},"web_url":"http://x/i3","labels":["bug"]}]"#,
        ),
    ]);
    let provider = GitLabProvider::default();

    let requests = provider.pull_requests(&project(&server), &token()).unwrap();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].number, 7);
    assert_eq!(requests[0].source_branch, "feature/login");
    assert!(requests[0].draft);

    let issues = provider.issues(&project(&server), &token()).unwrap();
    assert_eq!(issues[0].labels, ["bug"]);

    let first = received.lock().unwrap()[0].clone();
    assert!(
        first
            .headers
            .iter()
            .any(|header| header.to_lowercase() == "private-token: glpat-secret"),
        "{first:?}"
    );
}

#[test]
fn gitlab_creates_merge_requests_and_explains_refusals() {
    let (server, received) = serve(vec![(
        "/api/v4/projects/team%2Fapp/merge_requests",
        201,
        r#"{"iid":8,"title":"Fix","author":{"name":"Dana"},"source_branch":"fix","target_branch":"main","web_url":"http://x/8"}"#,
    )]);
    let created = GitLabProvider::default()
        .create_pull_request(
            &project(&server),
            &token(),
            &NewPullRequest {
                source_branch: "fix".into(),
                target_branch: "main".into(),
                title: "Fix".into(),
                description: String::new(),
            },
        )
        .unwrap();
    assert_eq!(created.number, 8);
    let post = received.lock().unwrap()[0].clone();
    assert!(post.line.starts_with("POST "), "{post:?}");
    assert!(post.body.contains(r#""source_branch":"fix""#), "{post:?}");

    let (refusing, _) = serve(vec![(
        "/api/v4/user",
        401,
        r#"{"message":"401 Unauthorized"}"#,
    )]);
    assert!(matches!(
        GitLabProvider::default().check(&refusing, &token()),
        Err(RepositoryError::HostingUnauthorized { .. })
    ));
}

#[test]
fn github_lists_pull_requests_and_leaves_them_out_of_issues() {
    let (server, received) = serve(vec![
        (
            "/api/v3/repos/team/app/pulls",
            200,
            r#"[{"number":12,"title":"Speed up","user":{"login":"dana"},"head":{"ref":"perf"},"base":{"ref":"main"},"html_url":"http://x/12"}]"#,
        ),
        (
            "/api/v3/repos/team/app/issues",
            200,
            r#"[{"number":12,"title":"Speed up","user":{"login":"dana"},"html_url":"http://x/12","pull_request":{}},{"number":4,"title":"Docs","user":{"login":"sam"},"html_url":"http://x/4","labels":[{"name":"docs"}]}]"#,
        ),
    ]);
    let provider = GitHubProvider::default();

    let pulls = provider.pull_requests(&project(&server), &token()).unwrap();
    assert_eq!(pulls[0].source_branch, "perf");
    let issues = provider.issues(&project(&server), &token()).unwrap();
    assert_eq!(issues.len(), 1);
    assert_eq!(issues[0].labels, ["docs"]);
    assert!(
        received.lock().unwrap()[0]
            .headers
            .iter()
            .any(|header| header.to_lowercase() == "authorization: bearer glpat-secret")
    );
}

#[test]
fn unreachable_servers_are_network_failures() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let server = Server::parse(&format!("http://{address}")).unwrap();
    assert!(matches!(
        GitLabProvider::default().check(&server, &token()),
        Err(RepositoryError::NetworkFailed { .. })
    ));
}

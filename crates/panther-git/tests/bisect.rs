//! Integration tests for [`GitBisector`] against a real repository.

mod support;

use std::fs;

use git2::Oid;
use panther_domain::bisect::BisectVerdict;
use panther_domain::commit::CommitId;
use panther_domain::ports::Bisector;
use panther_git::GitBisector;
use tempfile::TempDir;

/// Eight commits in a row; `state.txt` turns "broken" at the sixth.
fn history(dir: &TempDir) -> (Vec<Oid>, git2::Repository) {
    let repository = support::empty_repository(dir.path());
    let mut commits: Vec<Oid> = Vec::new();
    for n in 0..8 {
        let state = if n >= 5 { "broken\n" } else { "ok\n" };
        let counter = format!("{n}\n");
        let parents: Vec<Oid> = commits.last().copied().into_iter().collect();
        commits.push(support::commit(
            &repository,
            Some("HEAD"),
            &format!("Commit {n}"),
            &[("state.txt", state), ("n.txt", &counter)],
            &parents,
        ));
    }
    repository
        .checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
        .unwrap();
    (commits, repository)
}

fn id(oid: Oid) -> CommitId {
    CommitId::parse(&oid.to_string()).unwrap()
}

#[test]
fn finds_the_commit_that_broke_the_file() {
    let dir = TempDir::new().unwrap();
    let (commits, _repository) = history(&dir);
    let bisector = GitBisector::default();
    assert!(!bisector.status(dir.path()).unwrap().active);

    let mut status = bisector
        .start(dir.path(), "HEAD", &commits[0].to_string())
        .unwrap();
    assert!(status.active);
    assert!(status.steps_left.is_some());
    let mut verdicts = 0;
    while status.first_bad.is_none() {
        let broken = fs::read_to_string(dir.path().join("state.txt"))
            .unwrap()
            .contains("broken");
        status = bisector
            .mark(
                dir.path(),
                if broken {
                    BisectVerdict::Bad
                } else {
                    BisectVerdict::Good
                },
            )
            .unwrap();
        verdicts += 1;
        assert!(verdicts < 8, "bisect did not converge: {status:?}");
    }
    assert_eq!(status.first_bad, Some(id(commits[5])));
    assert_eq!(
        bisector.status(dir.path()).unwrap().first_bad,
        Some(id(commits[5]))
    );

    bisector.reset(dir.path()).unwrap();
    assert!(!bisector.status(dir.path()).unwrap().active);
}

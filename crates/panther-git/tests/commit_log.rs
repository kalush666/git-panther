//! Integration tests for [`Git2CommitLog`] against real repositories.

mod support;

use git2::{Oid, Repository};
use panther_domain::commit::{ChangeKind, CommitId, RefKind};
use panther_domain::ports::CommitLog;
use panther_domain::repository::RepositoryError;
use panther_git::{Git2CommitLog, GitCommitLog};
use tempfile::TempDir;

const LONG_TEXT: &str = "a file with enough content for git to detect it as renamed\n";

struct Fixture {
    dir: TempDir,
    repository: Repository,
    base: Oid,
    main: Oid,
    topic: Oid,
    merge: Oid,
}

/// `base` ← `main` and `base` ← `topic`, merged by `merge` on `main`;
/// tag `v1` on `base`.
fn merged_history() -> Fixture {
    let dir = TempDir::new().unwrap();
    let repository = support::empty_repository(dir.path());
    let base = support::commit(
        &repository,
        Some("HEAD"),
        "Base",
        &[("a.txt", LONG_TEXT)],
        &[],
    );
    let main = support::commit(
        &repository,
        Some("HEAD"),
        "Main work\n\nLonger body.",
        &[("a.txt", LONG_TEXT), ("main.txt", "main")],
        &[base],
    );
    let topic = support::commit(
        &repository,
        Some("refs/heads/topic"),
        "Rename on topic",
        &[("b.txt", LONG_TEXT)],
        &[base],
    );
    let merge = support::commit(
        &repository,
        Some("HEAD"),
        "Merge topic",
        &[("b.txt", LONG_TEXT), ("main.txt", "main")],
        &[main, topic],
    );
    {
        let base_object = repository.find_object(base, None).unwrap();
        repository
            .tag_lightweight("v1", &base_object, false)
            .unwrap();
    }
    Fixture {
        dir,
        repository,
        base,
        main,
        topic,
        merge,
    }
}

fn id(oid: Oid) -> CommitId {
    CommitId::parse(&oid.to_string()).unwrap()
}

/// Every implementation of the port must honour the same contract.
fn implementations() -> [(&'static str, Box<dyn CommitLog>); 2] {
    [
        ("libgit2", Box::new(Git2CommitLog)),
        ("routed", Box::new(GitCommitLog::default())),
    ]
}

/// Children appear before their parents, and every parent is listed.
fn assert_topological(history: &[panther_domain::commit::CommitNode]) {
    let position: std::collections::HashMap<&CommitId, usize> = history
        .iter()
        .enumerate()
        .map(|(index, node)| (&node.id, index))
        .collect();
    for (index, node) in history.iter().enumerate() {
        for parent in &node.parents {
            assert!(position[parent] > index, "{parent} listed before its child");
        }
    }
}

#[test]
fn history_lists_children_before_parents() {
    let fixture = merged_history();

    for (name, log) in implementations() {
        let history = log.history(fixture.dir.path()).unwrap();

        assert_eq!(history.len(), 4, "{name}");
        assert_eq!(history[0].id, id(fixture.merge), "{name}");
        assert_eq!(history[3].id, id(fixture.base), "{name}");
        assert_eq!(
            history[0].parents,
            [id(fixture.main), id(fixture.topic)],
            "{name}"
        );
        assert_topological(&history);
    }
}

#[test]
fn refs_name_branches_tags_and_head() {
    let fixture = merged_history();

    let mut refs = Git2CommitLog.refs(fixture.dir.path()).unwrap();
    refs.sort_by(|a, b| a.name.cmp(&b.name));

    let summary: Vec<(&str, RefKind, CommitId, bool)> = refs
        .iter()
        .map(|label| {
            (
                label.name.as_str(),
                label.kind,
                label.target.clone(),
                label.is_head,
            )
        })
        .collect();
    assert_eq!(
        summary,
        [
            ("main", RefKind::LocalBranch, id(fixture.merge), true),
            ("topic", RefKind::LocalBranch, id(fixture.topic), false),
            ("v1", RefKind::Tag, id(fixture.base), false),
        ]
    );
}

#[test]
fn summaries_follow_the_requested_order() {
    let fixture = merged_history();
    let ids = [id(fixture.base), id(fixture.main)];

    let summaries = Git2CommitLog.summaries(fixture.dir.path(), &ids).unwrap();

    assert_eq!(summaries[0].summary, "Base");
    assert_eq!(summaries[1].summary, "Main work");
    assert_eq!(summaries[1].body_preview, "Longer body.");
    assert_eq!(summaries[0].body_preview, "");
    assert_eq!(summaries[1].author.name, "Git Panther Tests");
    assert!(summaries[1].author.time > summaries[0].author.time);
}

#[test]
fn details_list_changed_files_against_the_first_parent() {
    let fixture = merged_history();
    let log = Git2CommitLog;

    let base = log.details(fixture.dir.path(), &id(fixture.base)).unwrap();
    let main = log.details(fixture.dir.path(), &id(fixture.main)).unwrap();
    let topic = log.details(fixture.dir.path(), &id(fixture.topic)).unwrap();

    assert_eq!(base.changes[0].kind, ChangeKind::Added);
    assert_eq!(main.message, "Main work\n\nLonger body.");
    assert_eq!(
        (main.changes[0].path.as_str(), &main.changes[0].kind),
        ("main.txt", &ChangeKind::Added)
    );
    assert_eq!(
        topic.changes[0].kind,
        ChangeKind::Renamed {
            from: "a.txt".into()
        }
    );
}

#[test]
fn fingerprint_changes_only_when_refs_move() {
    let fixture = merged_history();
    let log = Git2CommitLog;
    let before = log.refs_fingerprint(fixture.dir.path()).unwrap();

    assert_eq!(log.refs_fingerprint(fixture.dir.path()).unwrap(), before);

    let base = fixture.repository.find_commit(fixture.base).unwrap();
    fixture.repository.branch("hotfix", &base, false).unwrap();
    assert_ne!(log.refs_fingerprint(fixture.dir.path()).unwrap(), before);
}

#[test]
fn a_repository_without_commits_has_empty_history() {
    let dir = TempDir::new().unwrap();
    support::empty_repository(dir.path());

    for (name, log) in implementations() {
        assert_eq!(log.history(dir.path()).unwrap(), [], "{name}");
        assert_eq!(log.refs(dir.path()).unwrap(), [], "{name}");
    }
}

#[test]
fn unknown_commits_are_reported_as_not_found() {
    let fixture = merged_history();
    let unknown = CommitId::parse(&"f".repeat(40)).unwrap();

    assert!(matches!(
        Git2CommitLog.details(fixture.dir.path(), &unknown),
        Err(RepositoryError::CommitNotFound { .. })
    ));
}

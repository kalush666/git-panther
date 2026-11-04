//! Integration tests for [`Git2CommitLog`] against real repositories.

mod support;

use git2::{Oid, Repository};
use panther_domain::commit::{ChangeKind, CommitFilter, CommitId, RefKind};
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
        let history = log.history(fixture.dir.path(), &[]).unwrap();

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
        assert_eq!(log.history(dir.path(), &[]).unwrap(), [], "{name}");
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

#[test]
fn search_matches_messages_and_authors_ignoring_case() {
    let fixture = merged_history();
    for (name, log) in implementations() {
        let found = log.search(fixture.dir.path(), "RENAME on").unwrap();
        assert_eq!(found, [id(fixture.topic)], "{name}");
        let author = log.search(fixture.dir.path(), "git panther").unwrap();
        assert!(author.len() >= 4, "{name}: {author:?}");
        assert_eq!(log.search(fixture.dir.path(), "  ").unwrap(), [], "{name}");
    }
}

#[test]
fn hidden_refs_leave_their_own_commits_out() {
    let fixture = merged_history();
    let side = support::commit(
        &fixture.repository,
        Some("refs/heads/side"),
        "Side work",
        &[("side.txt", "side")],
        &[fixture.base],
    );
    for (name, log) in implementations() {
        let all = log.history(fixture.dir.path(), &[]).unwrap();
        assert!(all.iter().any(|node| node.id == id(side)), "{name}");
        let hidden = log
            .history(fixture.dir.path(), &["side".to_owned()])
            .unwrap();
        assert!(!hidden.iter().any(|node| node.id == id(side)), "{name}");
        assert_eq!(hidden.len(), all.len() - 1, "{name}");
    }
}

#[test]
fn file_history_and_blame_name_the_commits_that_touched_a_file() {
    let fixture = merged_history();
    for (name, log) in implementations() {
        let history = log
            .file_history(fixture.dir.path(), "main.txt", 10)
            .unwrap();
        assert_eq!(history, [id(fixture.main)], "{name}");

        let blame = log.blame(fixture.dir.path(), "main.txt").unwrap();
        assert_eq!(blame.len(), 1, "{name}");
        assert_eq!(blame[0].commit, id(fixture.main), "{name}");
        assert_eq!(blame[0].content, "main", "{name}");
        assert_eq!(blame[0].summary, "Main work", "{name}");
    }
}

#[test]
fn compares_a_branch_with_where_it_forked() {
    let fixture = merged_history();
    for (name, log) in implementations() {
        let comparison = log
            .compare(fixture.dir.path(), &fixture.main.to_string(), "topic")
            .unwrap();
        assert_eq!(comparison.fork, id(fixture.base), "{name}");
        assert_eq!(comparison.head, id(fixture.topic), "{name}");
        let commits: Vec<&CommitId> = comparison.commits.iter().map(|commit| &commit.id).collect();
        assert_eq!(commits, [&id(fixture.topic)], "{name}");
        assert_eq!(comparison.changes.len(), 1, "{name}");
        assert_eq!(comparison.changes[0].path, "b.txt", "{name}");
        assert!(
            matches!(&comparison.changes[0].kind, ChangeKind::Renamed { from } if from == "a.txt"),
            "{name}"
        );

        let diff = log
            .compare_file_diff(
                fixture.dir.path(),
                &comparison.fork,
                &comparison.head,
                "b.txt",
            )
            .unwrap();
        assert_eq!(diff.hunks.len(), 1, "{name}");

        assert!(
            matches!(
                log.compare(fixture.dir.path(), "main", "no-such-branch"),
                Err(RepositoryError::CommitNotFound { id }) if id == "no-such-branch"
            ),
            "{name}"
        );
    }
}

#[test]
fn reflog_marks_commits_no_branch_contains_as_lost() {
    let dir = TempDir::new().unwrap();
    let repository = support::empty_repository(dir.path());
    let first = support::commit(&repository, Some("HEAD"), "First", &[("a", "1")], &[]);
    let second = support::commit(&repository, Some("HEAD"), "Second", &[("a", "2")], &[first]);
    // A hard reset back to `first` leaves `second` on no branch.
    let branch = repository.head().unwrap().name().unwrap().to_owned();
    repository
        .reference(&branch, first, true, "reset: moving to HEAD~1")
        .unwrap();

    for (name, log) in implementations() {
        let reflog = log.reflog(dir.path()).unwrap();
        assert_eq!(reflog[0].id, id(first), "{name}");
        assert_eq!(reflog[0].action, "reset: moving to HEAD~1", "{name}");
        assert!(!reflog[0].lost, "{name}");
        let lost = reflog.iter().find(|entry| entry.id == id(second)).unwrap();
        assert!(lost.lost, "{name}");
        assert_eq!(lost.summary, "Second", "{name}");
    }
}

#[test]
fn filters_commits_by_author_and_time() {
    let fixture = merged_history();
    for (name, log) in implementations() {
        let everyone = log
            .filter(
                fixture.dir.path(),
                &CommitFilter {
                    author: Some("GIT PANTHER tests".into()),
                    since: None,
                },
            )
            .unwrap();
        assert_eq!(everyone.len(), 4, "{name}");

        let nobody = log
            .filter(
                fixture.dir.path(),
                &CommitFilter {
                    author: Some("someone else".into()),
                    since: None,
                },
            )
            .unwrap();
        assert_eq!(nobody, [], "{name}");

        // The fixture's commits are a minute apart, starting at 1_700_000_000.
        let mut recent = log
            .filter(
                fixture.dir.path(),
                &CommitFilter {
                    author: None,
                    since: Some(1_700_000_000 + 120),
                },
            )
            .unwrap();
        recent.sort_by(|a, b| a.as_str().cmp(b.as_str()));
        let mut expected = vec![id(fixture.topic), id(fixture.merge)];
        expected.sort_by(|a, b| a.as_str().cmp(b.as_str()));
        assert_eq!(recent, expected, "{name}");
    }
}

#[test]
fn formats_a_commit_as_a_mail_patch() {
    let fixture = merged_history();
    for (name, log) in implementations() {
        let patch = log.patch(fixture.dir.path(), &id(fixture.main)).unwrap();
        assert!(
            patch.contains("Subject: [PATCH] Main work"),
            "{name}: {patch}"
        );
        assert!(patch.contains("+main"), "{name}: {patch}");
    }
}

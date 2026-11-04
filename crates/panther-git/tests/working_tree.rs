//! Integration tests for [`GitWorkingTree`] and [`GitCommitWriter`] against
//! real repositories.

mod support;

use std::fs;
use std::path::Path;

use panther_domain::commit::CommitId;
use panther_domain::ports::{CommitLog, CommitWriter, HunkAction, WorkingTree};
use panther_domain::repository::RepositoryError;
use panther_domain::working_tree::{
    ChangedFile, CommitMessage, DiffSide, FileState, HunkRef, LineKind,
};
use panther_git::{GitCommitLog, GitCommitWriter, GitWorkingTree};
use tempfile::TempDir;

const LINES: usize = 40;

fn numbered_lines() -> String {
    (1..=LINES).fold(String::new(), |mut text, line| {
        text.push_str("line ");
        text.push_str(&line.to_string());
        text.push('\n');
        text
    })
}

/// A repository whose single commit holds `notes.txt` with 40 numbered lines,
/// with an identity configured so the git CLI can commit.
fn repository() -> TempDir {
    let dir = TempDir::new().unwrap();
    let repository = support::empty_repository(dir.path());
    let mut config = repository.config().unwrap();
    config.set_str("user.name", "Git Panther Tests").unwrap();
    config
        .set_str("user.email", "tests@git-panther.invalid")
        .unwrap();
    config.set_bool("commit.gpgsign", false).unwrap();
    // Independent of the machine's global settings (e.g. core.autocrlf=true).
    config.set_bool("core.autocrlf", false).unwrap();
    let text = numbered_lines();
    support::commit(
        &repository,
        Some("HEAD"),
        "Add notes",
        &[("notes.txt", &text)],
        &[],
    );
    // Make the work tree match the commit (support::commit only writes objects).
    fs::write(dir.path().join("notes.txt"), &text).unwrap();
    let mut index = repository.index().unwrap();
    index.add_path(Path::new("notes.txt")).unwrap();
    index.write().unwrap();
    dir
}

/// Changes line 2 and line 35 so the diff has two separate hunks.
fn edit_two_places(dir: &TempDir) {
    let text = numbered_lines()
        .replace("line 2\n", "line two\n")
        .replace("line 35\n", "line thirty-five\n");
    fs::write(dir.path().join("notes.txt"), text).unwrap();
}

fn tree() -> GitWorkingTree {
    GitWorkingTree::default()
}

fn hunk(dir: &TempDir, side: DiffSide, index: usize) -> HunkRef {
    let diff = tree().diff(dir.path(), "notes.txt", side).unwrap();
    HunkRef {
        path: "notes.txt".into(),
        index,
        header: diff.hunks[index].header.clone(),
        lines: None,
    }
}

fn file(path: &str, state: FileState) -> ChangedFile {
    ChangedFile {
        path: path.into(),
        state,
    }
}

#[test]
fn status_separates_staged_unstaged_and_untracked() {
    let dir = repository();
    edit_two_places(&dir);
    fs::write(dir.path().join("new.txt"), "fresh").unwrap();

    tree().stage(dir.path(), &["new.txt".into()]).unwrap();
    let status = tree().status(dir.path()).unwrap();

    assert_eq!(status.staged, [file("new.txt", FileState::Added)]);
    assert_eq!(status.unstaged, [file("notes.txt", FileState::Modified)]);
    assert_eq!(status.conflicted, Vec::<String>::new());
}

#[test]
fn diff_lists_hunks_with_line_numbers() {
    let dir = repository();
    edit_two_places(&dir);

    let diff = tree()
        .diff(dir.path(), "notes.txt", DiffSide::Unstaged)
        .unwrap();

    assert_eq!(diff.hunks.len(), 2);
    let removed = diff.hunks[0]
        .lines
        .iter()
        .find(|line| line.kind == LineKind::Removed)
        .unwrap();
    assert_eq!(
        (removed.content.as_str(), removed.old_number),
        ("line 2", Some(2))
    );
    assert!(!diff.is_binary);
}

#[test]
fn stages_and_unstages_a_single_hunk() {
    let dir = repository();
    edit_two_places(&dir);

    tree()
        .apply_hunk(
            dir.path(),
            &hunk(&dir, DiffSide::Unstaged, 0),
            HunkAction::Stage,
        )
        .unwrap();

    let staged = tree()
        .diff(dir.path(), "notes.txt", DiffSide::Staged)
        .unwrap();
    let unstaged = tree()
        .diff(dir.path(), "notes.txt", DiffSide::Unstaged)
        .unwrap();
    assert_eq!((staged.hunks.len(), unstaged.hunks.len()), (1, 1));
    assert!(staged.hunks[0].header.contains("-1,"));

    tree()
        .apply_hunk(
            dir.path(),
            &hunk(&dir, DiffSide::Staged, 0),
            HunkAction::Unstage,
        )
        .unwrap();
    let staged = tree()
        .diff(dir.path(), "notes.txt", DiffSide::Staged)
        .unwrap();
    assert_eq!(staged.hunks.len(), 0);
}

#[test]
fn discards_a_single_hunk_from_the_work_tree() {
    let dir = repository();
    edit_two_places(&dir);

    tree()
        .apply_hunk(
            dir.path(),
            &hunk(&dir, DiffSide::Unstaged, 1),
            HunkAction::Discard,
        )
        .unwrap();

    let text = fs::read_to_string(dir.path().join("notes.txt")).unwrap();
    assert!(text.contains("line two\n"), "the other hunk is kept");
    assert!(text.contains("line 35\n"), "the discarded hunk is restored");
}

#[test]
fn refuses_a_hunk_that_changed_since_it_was_shown() {
    let dir = repository();
    edit_two_places(&dir);
    let stale = HunkRef {
        header: "@@ -1,5 +1,5 @@ not what git shows".into(),
        ..hunk(&dir, DiffSide::Unstaged, 0)
    };

    let result = tree().apply_hunk(dir.path(), &stale, HunkAction::Stage);

    assert!(matches!(result, Err(RepositoryError::HunkOutdated { .. })));
}

#[test]
fn a_hunk_of_a_new_file_stages_the_whole_file() {
    let dir = repository();
    fs::write(dir.path().join("new.txt"), "one\ntwo\n").unwrap();
    let diff = tree()
        .diff(dir.path(), "new.txt", DiffSide::Unstaged)
        .unwrap();
    let new_file_hunk = HunkRef {
        path: "new.txt".into(),
        index: 0,
        header: diff.hunks[0].header.clone(),
        lines: None,
    };

    tree()
        .apply_hunk(dir.path(), &new_file_hunk, HunkAction::Stage)
        .unwrap();

    assert_eq!(
        tree().status(dir.path()).unwrap().staged,
        [file("new.txt", FileState::Added)]
    );
}

#[test]
fn discard_restores_tracked_files_and_deletes_untracked_ones() {
    let dir = repository();
    edit_two_places(&dir);
    fs::write(dir.path().join("scratch.txt"), "temp").unwrap();

    tree()
        .discard(dir.path(), &["notes.txt".into(), "scratch.txt".into()])
        .unwrap();

    assert_eq!(
        fs::read_to_string(dir.path().join("notes.txt")).unwrap(),
        numbered_lines()
    );
    assert!(!dir.path().join("scratch.txt").exists());
    assert!(tree().status(dir.path()).unwrap().is_clean());
}

#[test]
fn commits_staged_changes_and_amends_the_message() {
    let dir = repository();
    edit_two_places(&dir);
    tree().stage(dir.path(), &["notes.txt".into()]).unwrap();
    let writer = GitCommitWriter::default();

    let id = writer
        .commit(
            dir.path(),
            &CommitMessage::parse("Edit notes").unwrap(),
            false,
        )
        .unwrap();
    assert!(tree().status(dir.path()).unwrap().is_clean());
    assert_eq!(
        writer.head_message(dir.path()).unwrap().as_deref(),
        Some("Edit notes\n")
    );

    let amended = writer
        .commit(
            dir.path(),
            &CommitMessage::parse("Edit two notes").unwrap(),
            true,
        )
        .unwrap();
    assert_ne!(amended, id);
    assert_eq!(
        writer.head_message(dir.path()).unwrap().as_deref(),
        Some("Edit two notes\n")
    );
}

#[test]
fn reports_when_nothing_is_staged() {
    let dir = repository();

    let result = GitCommitWriter::default().commit(
        dir.path(),
        &CommitMessage::parse("Empty").unwrap(),
        false,
    );

    assert!(matches!(result, Err(RepositoryError::NothingToCommit)));
}

#[test]
fn stages_unstages_and_commits_before_the_first_commit() {
    let dir = TempDir::new().unwrap();
    let repository = support::empty_repository(dir.path());
    let mut config = repository.config().unwrap();
    config.set_str("user.name", "Git Panther Tests").unwrap();
    config
        .set_str("user.email", "tests@git-panther.invalid")
        .unwrap();
    fs::write(dir.path().join("first.txt"), "hello\n").unwrap();

    tree().stage(dir.path(), &["first.txt".into()]).unwrap();
    tree().unstage(dir.path(), &["first.txt".into()]).unwrap();
    assert_eq!(
        tree().status(dir.path()).unwrap().unstaged,
        [file("first.txt", FileState::Untracked)]
    );

    tree().stage(dir.path(), &["first.txt".into()]).unwrap();
    GitCommitWriter::default()
        .commit(dir.path(), &CommitMessage::parse("First").unwrap(), false)
        .unwrap();
    assert!(tree().status(dir.path()).unwrap().is_clean());
}

#[test]
fn commit_file_diff_shows_a_committed_change() {
    let dir = repository();
    edit_two_places(&dir);
    tree().stage(dir.path(), &["notes.txt".into()]).unwrap();
    let id: CommitId = GitCommitWriter::default()
        .commit(dir.path(), &CommitMessage::parse("Edit").unwrap(), false)
        .unwrap();

    let diff = GitCommitLog::default()
        .commit_file_diff(dir.path(), &id, "notes.txt")
        .unwrap();

    assert_eq!(diff.hunks.len(), 2);
}

/// Changes lines 2 and 3 next to each other, so both land in one hunk.
fn edit_neighbouring_lines(dir: &TempDir) {
    let text = numbered_lines()
        .replace("line 2\n", "line two\n")
        .replace("line 3\n", "line three\n");
    fs::write(dir.path().join("notes.txt"), text).unwrap();
}

/// `hunk` limited to the shown lines whose content is in `contents`.
fn lines_of(dir: &TempDir, side: DiffSide, contents: &[&str]) -> HunkRef {
    let diff = tree().diff(dir.path(), "notes.txt", side).unwrap();
    let lines = diff.hunks[0]
        .lines
        .iter()
        .enumerate()
        .filter(|(_, line)| contents.contains(&line.content.as_str()))
        .map(|(index, _)| index)
        .collect();
    HunkRef {
        lines: Some(lines),
        ..hunk(dir, side, 0)
    }
}

fn changed_contents(dir: &TempDir, side: DiffSide) -> Vec<String> {
    tree()
        .diff(dir.path(), "notes.txt", side)
        .unwrap()
        .hunks
        .iter()
        .flat_map(|hunk| hunk.lines.iter())
        .filter(|line| line.kind != panther_domain::working_tree::LineKind::Context)
        .map(|line| line.content.clone())
        .collect()
}

#[test]
fn stages_unstages_and_discards_selected_lines_of_a_hunk() {
    let dir = repository();
    edit_neighbouring_lines(&dir);

    let selected = lines_of(&dir, DiffSide::Unstaged, &["line 2", "line two"]);
    tree()
        .apply_hunk(dir.path(), &selected, HunkAction::Stage)
        .unwrap();
    assert_eq!(
        changed_contents(&dir, DiffSide::Staged),
        ["line 2", "line two"]
    );
    assert_eq!(
        changed_contents(&dir, DiffSide::Unstaged),
        ["line 3", "line three"]
    );

    let staged = lines_of(&dir, DiffSide::Staged, &["line 2", "line two"]);
    tree()
        .apply_hunk(dir.path(), &staged, HunkAction::Unstage)
        .unwrap();
    assert_eq!(
        changed_contents(&dir, DiffSide::Staged),
        Vec::<String>::new()
    );

    let discard = lines_of(&dir, DiffSide::Unstaged, &["line 3", "line three"]);
    tree()
        .apply_hunk(dir.path(), &discard, HunkAction::Discard)
        .unwrap();
    assert_eq!(
        changed_contents(&dir, DiffSide::Unstaged),
        ["line 2", "line two"]
    );
}

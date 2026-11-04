//! Reads commit history with libgit2.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;

use git2::{
    Commit, Delta, DiffFindOptions, DiffOptions, ErrorCode, Oid, Reference, Repository, Sort,
};
use panther_domain::commit::{
    BlameLine, ChangeKind, CommitDetails, CommitId, CommitNode, CommitSummary, FileChange, Person,
    RefKind, RefLabel, body_preview,
};
use panther_domain::ports::CommitLog;
use panther_domain::repository::RepositoryError;
use panther_domain::working_tree::FileDiff;

use super::diff::file_diff;
use super::git_error;

/// Pure-libgit2 history reader. Correct everywhere, but its revwalk ignores
/// git's commit-graph file, so [`crate::GitCommitLog`] routes the history walk
/// to the git CLI instead.
#[derive(Debug, Clone, Copy, Default)]
pub struct Git2CommitLog;

/// The commits history starts from: HEAD plus every branch, remote branch
/// and tag.
///
/// # Errors
/// [`RepositoryError`] when the repository cannot be read.
pub fn history_tips(
    repository: &Path,
    hidden: &[String],
) -> Result<Vec<CommitId>, RepositoryError> {
    let repository = open(repository)?;
    Ok(tips(&repository, hidden)?
        .into_iter()
        .map(commit_id)
        .collect())
}

impl CommitLog for Git2CommitLog {
    fn refs_fingerprint(&self, repository: &Path) -> Result<String, RepositoryError> {
        let repository = open(repository)?;
        let mut entries: Vec<(String, String)> = references(&repository)?
            .filter_map(|reference| {
                let name = reference.name().ok()?.to_owned();
                let target = reference.target().map(|oid| oid.to_string()).or_else(|| {
                    reference
                        .symbolic_target()
                        .ok()
                        .flatten()
                        .map(str::to_owned)
                })?;
                Some((name, target))
            })
            .collect();
        entries.sort();
        let head = repository
            .head()
            .ok()
            .and_then(|head| head.target())
            .map(|oid| oid.to_string());
        let mut hasher = DefaultHasher::new();
        (entries, head).hash(&mut hasher);
        Ok(format!("{:016x}", hasher.finish()))
    }

    fn history(
        &self,
        repository: &Path,
        hidden: &[String],
    ) -> Result<Vec<CommitNode>, RepositoryError> {
        let repository = open(repository)?;
        let mut walk = repository.revwalk().map_err(|error| git_error(&error))?;
        walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
            .map_err(|error| git_error(&error))?;
        for tip in tips(&repository, hidden)? {
            walk.push(tip).map_err(|error| git_error(&error))?;
        }
        walk.map(|oid| {
            let oid = oid.map_err(|error| git_error(&error))?;
            let commit = repository
                .find_commit(oid)
                .map_err(|error| git_error(&error))?;
            Ok(CommitNode {
                id: commit_id(oid),
                parents: commit.parent_ids().map(commit_id).collect(),
            })
        })
        .collect()
    }

    fn summaries(
        &self,
        repository: &Path,
        ids: &[CommitId],
    ) -> Result<Vec<CommitSummary>, RepositoryError> {
        let repository = open(repository)?;
        ids.iter()
            .map(|id| {
                let commit = find_commit(&repository, id)?;
                Ok(CommitSummary {
                    id: id.clone(),
                    parents: commit.parent_ids().map(commit_id).collect(),
                    summary: String::from_utf8_lossy(commit.summary_bytes().unwrap_or_default())
                        .into_owned(),
                    body_preview: body_preview(&String::from_utf8_lossy(commit.message_bytes())),
                    author: person(&commit.author()),
                })
            })
            .collect()
    }

    fn refs(&self, repository: &Path) -> Result<Vec<RefLabel>, RepositoryError> {
        let repository = open(repository)?;
        let head_branch = repository
            .head()
            .ok()
            .filter(Reference::is_branch)
            .and_then(|head| head.name().ok().map(str::to_owned));
        let labels = references(&repository)?
            .filter_map(|reference| {
                let kind = ref_kind(&reference)?;
                let name = reference.shorthand().ok()?.to_owned();
                if kind == RefKind::RemoteBranch && name.ends_with("/HEAD") {
                    return None;
                }
                let target = reference.peel_to_commit().ok()?.id();
                Some(RefLabel {
                    is_head: reference.name().ok() == head_branch.as_deref(),
                    name,
                    kind,
                    target: commit_id(target),
                })
            })
            .collect();
        Ok(labels)
    }

    fn details(&self, repository: &Path, id: &CommitId) -> Result<CommitDetails, RepositoryError> {
        let repository = open(repository)?;
        let commit = find_commit(&repository, id)?;
        Ok(CommitDetails {
            id: id.clone(),
            parents: commit.parent_ids().map(commit_id).collect(),
            message: String::from_utf8_lossy(commit.message_bytes()).into_owned(),
            author: person(&commit.author()),
            committer: person(&commit.committer()),
            changes: changes(&repository, &commit)?,
        })
    }

    fn commit_file_diff(
        &self,
        repository: &Path,
        id: &CommitId,
        path: &str,
    ) -> Result<FileDiff, RepositoryError> {
        let repository = open(repository)?;
        let commit = find_commit(&repository, id)?;
        let tree = commit.tree().map_err(|error| git_error(&error))?;
        let parent_tree = match commit.parent(0) {
            Ok(parent) => Some(parent.tree().map_err(|error| git_error(&error))?),
            Err(_) => None,
        };
        // Limited to one path, so a rename shows as the file being added.
        let mut options = DiffOptions::new();
        options.pathspec(path).disable_pathspec_match(true);
        let diff = repository
            .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut options))
            .map_err(|error| git_error(&error))?;
        file_diff(&diff, path)
    }

    fn search(&self, repository: &Path, query: &str) -> Result<Vec<CommitId>, RepositoryError> {
        let needle = query.trim().to_lowercase();
        if needle.is_empty() {
            return Ok(Vec::new());
        }
        let repository = open(repository)?;
        let mut matches = Vec::new();
        for oid in walk_all(&repository)? {
            let commit = repository
                .find_commit(oid)
                .map_err(|error| git_error(&error))?;
            let author = commit.author();
            let haystack = format!(
                "{}\n{}\n{}",
                String::from_utf8_lossy(commit.message_bytes()),
                String::from_utf8_lossy(author.name_bytes()),
                String::from_utf8_lossy(author.email_bytes()),
            )
            .to_lowercase();
            if haystack.contains(&needle) {
                matches.push(commit_id(oid));
            }
        }
        Ok(matches)
    }

    fn file_history(
        &self,
        repository: &Path,
        path: &str,
        limit: usize,
    ) -> Result<Vec<CommitId>, RepositoryError> {
        let repository = open(repository)?;
        let mut walk = repository.revwalk().map_err(|error| git_error(&error))?;
        walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
            .map_err(|error| git_error(&error))?;
        walk.push_head().map_err(|error| git_error(&error))?;
        let mut touched = Vec::new();
        for oid in walk {
            if touched.len() >= limit {
                break;
            }
            let oid = oid.map_err(|error| git_error(&error))?;
            let commit = repository
                .find_commit(oid)
                .map_err(|error| git_error(&error))?;
            let tree = commit.tree().map_err(|error| git_error(&error))?;
            let parent_tree = commit.parent(0).ok().and_then(|parent| parent.tree().ok());
            let mut options = DiffOptions::new();
            options.pathspec(path).disable_pathspec_match(true);
            let diff = repository
                .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut options))
                .map_err(|error| git_error(&error))?;
            if diff.deltas().next().is_some() {
                touched.push(commit_id(oid));
            }
        }
        Ok(touched)
    }

    fn blame(&self, repository: &Path, path: &str) -> Result<Vec<BlameLine>, RepositoryError> {
        let repository = open(repository)?;
        let not_found = || RepositoryError::NotFound {
            path: Path::new(path).to_path_buf(),
        };
        let head = repository
            .head()
            .and_then(|head| head.peel_to_tree())
            .map_err(|error| git_error(&error))?;
        let blob = head
            .get_path(Path::new(path))
            .and_then(|entry| entry.to_object(&repository))
            .ok()
            .and_then(|object| object.into_blob().ok())
            .ok_or_else(not_found)?;
        let text = String::from_utf8_lossy(blob.content()).into_owned();
        let blame = repository
            .blame_file(Path::new(path), None)
            .map_err(|error| git_error(&error))?;
        text.lines()
            .enumerate()
            .map(|(index, content)| {
                let line = u32::try_from(index + 1).unwrap_or(u32::MAX);
                let hunk = blame
                    .get_line(index + 1)
                    .ok_or_else(|| git_error(&git2::Error::from_str("blame is incomplete")))?;
                let commit = repository
                    .find_commit(hunk.final_commit_id())
                    .map_err(|error| git_error(&error))?;
                // The blamed commit's author when the hunk has no signature.
                let author = hunk.final_signature().unwrap_or_else(|| commit.author());
                Ok(BlameLine {
                    line,
                    commit: commit_id(commit.id()),
                    author: String::from_utf8_lossy(author.name_bytes()).into_owned(),
                    time: author.when().seconds(),
                    summary: String::from_utf8_lossy(commit.summary_bytes().unwrap_or_default())
                        .into_owned(),
                    content: content.to_owned(),
                })
            })
            .collect()
    }
}

/// Every commit reachable from HEAD and all refs.
fn walk_all(repository: &Repository) -> Result<Vec<Oid>, RepositoryError> {
    let mut walk = repository.revwalk().map_err(|error| git_error(&error))?;
    for tip in tips(repository, &[])? {
        walk.push(tip).map_err(|error| git_error(&error))?;
    }
    walk.map(|oid| oid.map_err(|error| git_error(&error)))
        .collect()
}

fn open(path: &Path) -> Result<Repository, RepositoryError> {
    Repository::open(path).map_err(|error| match error.code() {
        ErrorCode::NotFound => RepositoryError::NotARepository {
            path: path.to_path_buf(),
        },
        _ => git_error(&error),
    })
}

fn references(
    repository: &Repository,
) -> Result<impl Iterator<Item = Reference<'_>>, RepositoryError> {
    Ok(repository
        .references()
        .map_err(|error| git_error(&error))?
        .filter_map(Result::ok))
}

/// HEAD plus every branch, remote branch and tag that points at a commit.
/// Commits the graph starts from: HEAD plus every branch and tag not hidden.
fn tips(repository: &Repository, hidden: &[String]) -> Result<Vec<Oid>, RepositoryError> {
    let mut tips: Vec<Oid> = references(repository)?
        .filter(|reference| ref_kind(reference).is_some())
        .filter(|reference| {
            reference
                .shorthand()
                .is_ok_and(|name| !hidden.iter().any(|hidden| hidden == name))
        })
        .filter_map(|reference| reference.peel_to_commit().ok().map(|commit| commit.id()))
        .collect();
    if let Ok(head) = repository.head().and_then(|head| head.peel_to_commit()) {
        tips.push(head.id());
    }
    tips.sort_unstable();
    tips.dedup();
    Ok(tips)
}

fn ref_kind(reference: &Reference<'_>) -> Option<RefKind> {
    if reference.is_branch() {
        Some(RefKind::LocalBranch)
    } else if reference.is_remote() {
        Some(RefKind::RemoteBranch)
    } else if reference.is_tag() {
        Some(RefKind::Tag)
    } else {
        None
    }
}

fn find_commit<'repo>(
    repository: &'repo Repository,
    id: &CommitId,
) -> Result<Commit<'repo>, RepositoryError> {
    let not_found = || RepositoryError::CommitNotFound { id: id.to_string() };
    let oid = Oid::from_str(id.as_str()).map_err(|_| not_found())?;
    repository
        .find_commit(oid)
        .map_err(|error| match error.code() {
            ErrorCode::NotFound => not_found(),
            _ => git_error(&error),
        })
}

fn commit_id(oid: Oid) -> CommitId {
    CommitId::parse(&oid.to_string()).expect("git object ids are always full hex ids")
}

fn person(signature: &git2::Signature<'_>) -> Person {
    Person {
        name: String::from_utf8_lossy(signature.name_bytes()).into_owned(),
        email: String::from_utf8_lossy(signature.email_bytes()).into_owned(),
        time: signature.when().seconds(),
    }
}

/// Files changed compared to the first parent (or added, for a root commit).
fn changes(
    repository: &Repository,
    commit: &Commit<'_>,
) -> Result<Vec<FileChange>, RepositoryError> {
    let tree = commit.tree().map_err(|error| git_error(&error))?;
    let parent_tree = match commit.parent(0) {
        Ok(parent) => Some(parent.tree().map_err(|error| git_error(&error))?),
        Err(_) => None,
    };
    let mut diff = repository
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
        .map_err(|error| git_error(&error))?;
    diff.find_similar(Some(DiffFindOptions::new().renames(true)))
        .map_err(|error| git_error(&error))?;

    Ok(diff
        .deltas()
        .filter_map(|delta| {
            let path_of = |file: git2::DiffFile<'_>| {
                file.path()
                    .map(|path| path.to_string_lossy().replace('\\', "/"))
            };
            let new_path = path_of(delta.new_file());
            let old_path = path_of(delta.old_file());
            let (path, kind) = match delta.status() {
                Delta::Added => (new_path?, ChangeKind::Added),
                Delta::Deleted => (old_path?, ChangeKind::Deleted),
                Delta::Renamed => (
                    new_path?,
                    ChangeKind::Renamed {
                        from: old_path.unwrap_or_default(),
                    },
                ),
                Delta::Typechange => (new_path?, ChangeKind::TypeChanged),
                _ => (new_path.or(old_path)?, ChangeKind::Modified),
            };
            Some(FileChange { path, kind })
        })
        .collect())
}

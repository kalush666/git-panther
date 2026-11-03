//! Lists branches with libgit2, including upstream ahead/behind counts.

use std::path::Path;

use git2::{BranchType, Repository};
use panther_domain::branch::{Branch, BranchKind};
use panther_domain::commit::CommitId;
use panther_domain::repository::RepositoryError;

use super::git_error;
use super::working_tree::open;

/// Local branches first, then remote branches, each sorted by name.
pub fn branches(repository: &Path) -> Result<Vec<Branch>, RepositoryError> {
    let repo = open(repository)?;
    let head = repo
        .head()
        .ok()
        .filter(git2::Reference::is_branch)
        .and_then(|head| head.shorthand().ok().map(str::to_owned));

    let mut result = Vec::new();
    for entry in repo.branches(None).map_err(|error| git_error(&error))? {
        let (branch, kind) = entry.map_err(|error| git_error(&error))?;
        let Some(name) = branch.name().ok().flatten().map(str::to_owned) else {
            continue;
        };
        // `origin/HEAD` only points at the remote's default branch.
        if branch.get().symbolic_target().ok().flatten().is_some() {
            continue;
        }
        let Ok(target) = branch.get().peel_to_commit() else {
            continue;
        };
        let kind = match kind {
            BranchType::Local => BranchKind::Local,
            BranchType::Remote => BranchKind::Remote,
        };
        let (upstream, ahead, behind) = match kind {
            BranchKind::Local => tracking(&repo, &branch, target.id())?,
            BranchKind::Remote => (None, 0, 0),
        };
        result.push(Branch {
            is_head: kind == BranchKind::Local && head.as_deref() == Some(name.as_str()),
            name,
            kind,
            target: CommitId::parse(&target.id().to_string())
                .expect("git object ids are always full hex ids"),
            upstream,
            ahead,
            behind,
        });
    }
    result.sort_by(|a, b| {
        (a.kind == BranchKind::Remote, &a.name).cmp(&(b.kind == BranchKind::Remote, &b.name))
    });
    Ok(result)
}

fn tracking(
    repo: &Repository,
    branch: &git2::Branch<'_>,
    local: git2::Oid,
) -> Result<(Option<String>, u32, u32), RepositoryError> {
    let Ok(upstream) = branch.upstream() else {
        return Ok((None, 0, 0));
    };
    let name = upstream.name().ok().flatten().map(str::to_owned);
    let Some(remote) = upstream.get().target() else {
        return Ok((name, 0, 0));
    };
    let (ahead, behind) = repo
        .graph_ahead_behind(local, remote)
        .map_err(|error| git_error(&error))?;
    Ok((name, saturate(ahead), saturate(behind)))
}

fn saturate(count: usize) -> u32 {
    u32::try_from(count).unwrap_or(u32::MAX)
}

/// Which kinds of branch named `name` exist.
pub fn branch_exists(
    repository: &Path,
    name: &str,
    kind: BranchKind,
) -> Result<bool, RepositoryError> {
    let repo = open(repository)?;
    let branch_type = match kind {
        BranchKind::Local => BranchType::Local,
        BranchKind::Remote => BranchType::Remote,
    };
    Ok(repo.find_branch(name, branch_type).is_ok())
}

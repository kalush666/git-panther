//! Rewriting and moving history: merge, rebase, cherry-pick, revert, reset,
//! tags, and what HEAD looked like before, so an action can be undone.

use std::fmt;

use crate::branch::ref_name_problem;
use crate::commit::CommitId;

/// How far `reset` goes beyond moving the branch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResetMode {
    /// Keep the index and the work tree: the undone commits become staged.
    Soft,
    /// Keep the work tree: the undone commits become unstaged changes.
    Mixed,
    /// Throw away the index and work tree changes too.
    Hard,
}

/// Where HEAD was: on a branch (and at which commit), or detached.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HeadSnapshot {
    pub branch: Option<String>,
    pub commit: CommitId,
}

/// A valid tag name (the part after `refs/tags/`).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TagName(String);

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("\"{name}\" is not a valid tag name: {reason}.")]
pub struct InvalidTagName {
    pub name: String,
    pub reason: &'static str,
}

impl TagName {
    /// Applies git's reference-name rules.
    ///
    /// # Errors
    /// [`InvalidTagName`] explaining the first rule the name breaks.
    pub fn parse(input: &str) -> Result<Self, InvalidTagName> {
        let name = input.trim();
        match ref_name_problem(name) {
            Some(reason) => Err(InvalidTagName {
                name: name.to_owned(),
                reason,
            }),
            None => Ok(Self(name.to_owned())),
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for TagName {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

/// What to do with one commit during an interactive rebase.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebaseAction {
    Pick,
    /// Keep the changes with a new message.
    Reword(String),
    /// Meld into the previous commit, combining both messages.
    Squash,
    /// Meld into the previous commit, keeping the previous message.
    Fixup,
    Drop,
}

/// One line of an interactive rebase, oldest commit first.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RebaseStep {
    pub commit: CommitId,
    pub action: RebaseAction,
}

/// Why an interactive rebase plan cannot run.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum InvalidRebasePlan {
    #[error("There are no commits to rebase.")]
    Empty,
    #[error(
        "The first kept commit cannot be squashed or fixed up: there is nothing before it to meld into."
    )]
    MeldsIntoNothing,
    #[error("A reworded commit needs a message.")]
    EmptyMessage,
}

/// Checks a plan before handing it to git.
///
/// # Errors
/// [`InvalidRebasePlan`] naming the first problem.
pub fn check_rebase_plan(steps: &[RebaseStep]) -> Result<(), InvalidRebasePlan> {
    if steps.is_empty() {
        return Err(InvalidRebasePlan::Empty);
    }
    let first_kept = steps.iter().find(|step| step.action != RebaseAction::Drop);
    if first_kept
        .is_some_and(|step| matches!(step.action, RebaseAction::Squash | RebaseAction::Fixup))
    {
        return Err(InvalidRebasePlan::MeldsIntoNothing);
    }
    let empty_reword = steps.iter().any(
        |step| matches!(&step.action, RebaseAction::Reword(message) if message.trim().is_empty()),
    );
    if empty_reword {
        return Err(InvalidRebasePlan::EmptyMessage);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(n: u8, action: RebaseAction) -> RebaseStep {
        RebaseStep {
            commit: CommitId::parse(&format!("{n:040x}")).unwrap(),
            action,
        }
    }

    #[test]
    fn rebase_plans_need_something_to_meld_into() {
        assert_eq!(check_rebase_plan(&[]), Err(InvalidRebasePlan::Empty));
        assert_eq!(
            check_rebase_plan(&[step(1, RebaseAction::Drop), step(2, RebaseAction::Fixup)]),
            Err(InvalidRebasePlan::MeldsIntoNothing)
        );
        assert_eq!(
            check_rebase_plan(&[step(1, RebaseAction::Reword("  ".into()))]),
            Err(InvalidRebasePlan::EmptyMessage)
        );
        assert!(
            check_rebase_plan(&[step(1, RebaseAction::Pick), step(2, RebaseAction::Squash)])
                .is_ok()
        );
    }

    #[test]
    fn tag_names_follow_ref_rules() {
        assert_eq!(TagName::parse(" v1.2.0 ").unwrap().as_str(), "v1.2.0");
        assert!(TagName::parse("release/2026-11").is_ok());
        for bad in ["", "v1 beta", "-v1", "v1..2", "v1.lock"] {
            assert!(TagName::parse(bad).is_err(), "{bad}");
        }
    }
}

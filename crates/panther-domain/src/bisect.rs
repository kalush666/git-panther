//! Bisect: halving the commits between a good and a bad one until the commit
//! that introduced a problem is found.

use crate::commit::CommitId;

/// What the user found when testing the checked-out commit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BisectVerdict {
    Good,
    Bad,
    /// Cannot be tested (e.g. it does not build); git picks a neighbour.
    Skip,
}

impl BisectVerdict {
    /// The `git bisect` subcommand.
    pub fn as_git(self) -> &'static str {
        match self {
            Self::Good => "good",
            Self::Bad => "bad",
            Self::Skip => "skip",
        }
    }
}

/// Where a bisect stands.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BisectStatus {
    pub active: bool,
    /// The commit checked out for testing, while still searching.
    pub testing: Option<CommitId>,
    /// About how many more verdicts are needed, as git estimates.
    pub steps_left: Option<u32>,
    /// The answer, once found.
    pub first_bad: Option<CommitId>,
    pub good: Vec<CommitId>,
    pub bad: Vec<CommitId>,
}

/// What `git bisect start / good / bad / skip` printed, read for the answer
/// or for how many steps remain.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BisectProgress {
    pub steps_left: Option<u32>,
    pub first_bad: Option<CommitId>,
}

impl BisectProgress {
    /// Reads `Bisecting: 6 revisions left to test after this (roughly 3 steps)`
    /// or `<sha> is the first bad commit`.
    pub fn parse(output: &str) -> Self {
        let first_bad = output.lines().find_map(|line| {
            line.strip_suffix(" is the first bad commit")
                .and_then(|id| CommitId::parse(id.trim()).ok())
        });
        let steps_left = output.lines().find_map(|line| {
            let roughly = line.split("(roughly ").nth(1)?;
            roughly.split_whitespace().next()?.parse().ok()
        });
        Self {
            steps_left: if first_bad.is_some() {
                Some(0)
            } else {
                steps_left
            },
            first_bad,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_steps_left_and_the_answer() {
        let searching = BisectProgress::parse(
            "Bisecting: 6 revisions left to test after this (roughly 3 steps)\n[0123] Subject",
        );
        assert_eq!(searching.steps_left, Some(3));
        assert_eq!(searching.first_bad, None);

        let id = "a".repeat(40);
        let found = BisectProgress::parse(&format!(
            "{id} is the first bad commit\ncommit {id}\nAuthor: A"
        ));
        assert_eq!(found.first_bad.unwrap().as_str(), id);
        assert_eq!(found.steps_left, Some(0));
    }
}

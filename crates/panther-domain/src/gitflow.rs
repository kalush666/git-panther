//! Git flow: feature, release and hotfix branches with fixed prefixes, started
//! from and finished into `develop` and the main branch.

/// The three kinds of git flow branch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlowKind {
    Feature,
    Release,
    Hotfix,
}

/// The long-lived branch a flow branch starts from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlowBase {
    Develop,
    Main,
}

/// The integration branch of git flow.
pub const DEVELOP: &str = "develop";

/// Main branch names, in the order they are looked for.
pub const MAIN_CANDIDATES: [&str; 2] = ["main", "master"];

impl FlowKind {
    pub const ALL: [Self; 3] = [Self::Feature, Self::Release, Self::Hotfix];

    pub fn prefix(self) -> &'static str {
        match self {
            Self::Feature => "feature/",
            Self::Release => "release/",
            Self::Hotfix => "hotfix/",
        }
    }

    /// Features and releases start from `develop`, hotfixes from main.
    pub fn base(self) -> FlowBase {
        match self {
            Self::Feature | Self::Release => FlowBase::Develop,
            Self::Hotfix => FlowBase::Main,
        }
    }

    /// Releases and hotfixes reach main, so they are tagged with their name.
    pub fn is_tagged(self) -> bool {
        !matches!(self, Self::Feature)
    }

    /// The flow branch `branch` is, and its name without the prefix:
    /// `release/1.2` → (`Release`, `1.2`).
    pub fn of(branch: &str) -> Option<(Self, &str)> {
        Self::ALL.into_iter().find_map(|kind| {
            branch
                .strip_prefix(kind.prefix())
                .filter(|name| !name.is_empty())
                .map(|name| (kind, name))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_flow_branches_by_prefix() {
        assert_eq!(
            FlowKind::of("feature/login"),
            Some((FlowKind::Feature, "login"))
        );
        assert_eq!(
            FlowKind::of("release/1.2"),
            Some((FlowKind::Release, "1.2"))
        );
        assert_eq!(FlowKind::of("hotfix/"), None);
        assert_eq!(FlowKind::of("bugfix/x"), None);
        assert!(FlowKind::Hotfix.is_tagged() && !FlowKind::Feature.is_tagged());
        assert_eq!(FlowKind::Hotfix.base(), FlowBase::Main);
    }
}

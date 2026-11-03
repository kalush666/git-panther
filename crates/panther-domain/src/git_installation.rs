//! The system git installation Git Panther relies on for network operations.

use std::fmt;

/// A git release version as reported by `git --version`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GitVersion {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

/// The output of `git --version` could not be understood.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("unrecognized `git --version` output: {output:?}")]
pub struct GitVersionParseError {
    pub output: String,
}

impl GitVersion {
    /// Oldest git release Git Panther supports.
    pub const MINIMUM_SUPPORTED: Self = Self::new(2, 40, 0);

    pub const fn new(major: u32, minor: u32, patch: u32) -> Self {
        Self {
            major,
            minor,
            patch,
        }
    }

    /// Parses the first line printed by `git --version`, e.g.
    /// `git version 2.52.0.windows.1` or `git version 2.39.3 (Apple Git-146)`.
    ///
    /// # Errors
    /// Returns [`GitVersionParseError`] when the text does not contain a
    /// `git version <major>.<minor>[.<patch>]` prefix.
    pub fn parse_cli_output(output: &str) -> Result<Self, GitVersionParseError> {
        let unrecognized = || GitVersionParseError {
            output: output.trim().to_owned(),
        };
        let version_text = output
            .trim()
            .strip_prefix("git version ")
            .and_then(|rest| rest.split_whitespace().next())
            .ok_or_else(unrecognized)?;

        let mut numbers = version_text.split('.').map(str::parse::<u32>);
        let major = numbers
            .next()
            .and_then(Result::ok)
            .ok_or_else(unrecognized)?;
        let minor = numbers
            .next()
            .and_then(Result::ok)
            .ok_or_else(unrecognized)?;
        let patch = numbers.next().and_then(Result::ok).unwrap_or(0);
        Ok(Self::new(major, minor, patch))
    }

    pub fn is_supported(self) -> bool {
        self >= Self::MINIMUM_SUPPORTED
    }
}

impl fmt::Display for GitVersion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

/// Whether the system git can be used by Git Panther.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GitInstallation {
    Supported(GitVersion),
    Unsupported { found: GitVersion },
    Missing,
}

impl GitInstallation {
    pub fn from_detected(version: Option<GitVersion>) -> Self {
        match version {
            None => Self::Missing,
            Some(found) if found.is_supported() => Self::Supported(found),
            Some(found) => Self::Unsupported { found },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_windows_build_suffix() {
        let version = GitVersion::parse_cli_output("git version 2.52.0.windows.1\n").unwrap();
        assert_eq!(version, GitVersion::new(2, 52, 0));
    }

    #[test]
    fn parses_apple_git_suffix() {
        let version = GitVersion::parse_cli_output("git version 2.39.3 (Apple Git-146)").unwrap();
        assert_eq!(version, GitVersion::new(2, 39, 3));
    }

    #[test]
    fn defaults_missing_patch_to_zero() {
        let version = GitVersion::parse_cli_output("git version 2.45").unwrap();
        assert_eq!(version, GitVersion::new(2, 45, 0));
    }

    #[test]
    fn rejects_unrelated_output() {
        let error = GitVersion::parse_cli_output("'git' is not recognized").unwrap_err();
        assert_eq!(error.output, "'git' is not recognized");
    }

    #[test]
    fn rejects_non_numeric_version() {
        assert!(GitVersion::parse_cli_output("git version two.forty").is_err());
    }

    #[test]
    fn displays_as_dotted_triple() {
        assert_eq!(GitVersion::new(2, 40, 1).to_string(), "2.40.1");
    }

    #[test]
    fn classifies_installations_against_minimum() {
        let old = GitVersion::new(2, 39, 9);
        assert_eq!(
            GitInstallation::from_detected(None),
            GitInstallation::Missing
        );
        assert_eq!(
            GitInstallation::from_detected(Some(old)),
            GitInstallation::Unsupported { found: old }
        );
        assert_eq!(
            GitInstallation::from_detected(Some(GitVersion::MINIMUM_SUPPORTED)),
            GitInstallation::Supported(GitVersion::MINIMUM_SUPPORTED)
        );
    }
}

//! Integration tests for [`SystemGitProbe`] against the real system git.

use std::path::Path;

use panther_domain::ports::GitBinaryProbe;
use panther_git::SystemGitProbe;

#[test]
fn detects_installed_git() {
    let version = SystemGitProbe
        .version_of(Path::new("git"))
        .expect("system git should be queryable on dev and CI machines");
    assert!(
        version.is_some(),
        "git must be on PATH to run the test suite"
    );
}

#[test]
fn reports_missing_executable_as_none() {
    let missing = Path::new("git-panther-definitely-not-installed");
    assert_eq!(SystemGitProbe.version_of(missing).unwrap(), None);
}

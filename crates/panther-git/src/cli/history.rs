//! Reads commit topology with `git rev-list`, which uses git's commit-graph
//! file and is several times faster than a libgit2 revwalk on large histories.

use std::io::Write;
use std::path::Path;
use std::process::Stdio;

use panther_domain::commit::{CommitId, CommitNode};
use panther_domain::repository::RepositoryError;

use super::background_command;

/// Every commit reachable from `tips`, children before parents and newest
/// first (`--date-order`).
///
/// # Errors
/// [`RepositoryError::Git`] when git fails or prints something unexpected.
pub fn read_history(
    executable: &Path,
    repository: &Path,
    tips: &[CommitId],
) -> Result<Vec<CommitNode>, RepositoryError> {
    if tips.is_empty() {
        return Ok(Vec::new());
    }
    let mut child = background_command(executable)
        .arg("-C")
        .arg(repository)
        .args(["rev-list", "--date-order", "--parents", "--stdin"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| git_failed(&format!("could not start git: {error}")))?;

    let mut stdin = child.stdin.take().expect("stdin is piped above");
    let input = tips.iter().fold(String::new(), |mut input, tip| {
        input.push_str(tip.as_str());
        input.push('\n');
        input
    });
    // Writing on this thread is fine: git reads all tips before printing.
    stdin
        .write_all(input.as_bytes())
        .map_err(|error| git_failed(&error.to_string()))?;
    drop(stdin);

    let output = child
        .wait_with_output()
        .map_err(|error| git_failed(&error.to_string()))?;
    if !output.status.success() {
        return Err(git_failed(String::from_utf8_lossy(&output.stderr).trim()));
    }
    parse_rev_list(&String::from_utf8_lossy(&output.stdout))
}

/// Parses `rev-list --parents` output: one `<commit> <parent>…` line each.
fn parse_rev_list(output: &str) -> Result<Vec<CommitNode>, RepositoryError> {
    output
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            let mut ids = line.split(' ').map(|hex| {
                CommitId::parse(hex)
                    .map_err(|_| git_failed(&format!("unexpected rev-list line {line:?}")))
            });
            let id = ids.next().expect("split yields at least one item")?;
            let parents = ids.collect::<Result<Vec<_>, _>>()?;
            Ok(CommitNode { id, parents })
        })
        .collect()
}

fn git_failed(details: &str) -> RepositoryError {
    RepositoryError::Git {
        details: details.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const C: &str = "cccccccccccccccccccccccccccccccccccccccc";

    #[test]
    fn parses_commits_with_any_number_of_parents() {
        let nodes = parse_rev_list(&format!("{A} {B} {C}\n{B} {C}\n{C}\n")).unwrap();
        assert_eq!(nodes.len(), 3);
        assert_eq!(nodes[0].parents.len(), 2);
        assert_eq!(nodes[2].parents, []);
    }

    #[test]
    fn rejects_garbage() {
        assert!(matches!(
            parse_rev_list("warning: something\n"),
            Err(RepositoryError::Git { .. })
        ));
    }
}

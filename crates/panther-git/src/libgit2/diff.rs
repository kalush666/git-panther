//! Converts libgit2 diffs into domain [`FileDiff`]s and hunk patches.

use git2::{Diff, DiffLineType, Patch};
use panther_domain::repository::RepositoryError;
use panther_domain::working_tree::{DiffLine, FileDiff, Hunk, LineKind, MAX_DIFF_LINES};

use super::git_error;

/// The diff of the single file in `diff` (or an empty diff if it has none).
///
/// # Errors
/// [`RepositoryError::Git`] when libgit2 cannot produce the patch.
pub fn file_diff(diff: &Diff<'_>, file_path: &str) -> Result<FileDiff, RepositoryError> {
    let Some(delta) = diff.deltas().next() else {
        return Ok(empty(file_path));
    };
    let old_path = delta
        .old_file()
        .path()
        .map(|old| old.to_string_lossy().replace('\\', "/"))
        .filter(|old| old != file_path);
    let patch = Patch::from_diff(diff, 0).map_err(|error| git_error(&error))?;
    let is_binary = delta.flags().is_binary() || patch.is_none();
    let Some(patch) = patch.filter(|_| !is_binary) else {
        return Ok(FileDiff {
            old_path,
            is_binary: true,
            ..empty(file_path)
        });
    };

    let total_lines: usize = (0..patch.num_hunks())
        .map(|hunk| patch.num_lines_in_hunk(hunk).unwrap_or(0))
        .sum();
    if total_lines > MAX_DIFF_LINES {
        return Ok(FileDiff {
            old_path,
            is_truncated: true,
            ..empty(file_path)
        });
    }

    let hunks = (0..patch.num_hunks())
        .map(|index| hunk(&patch, index))
        .collect::<Result<_, _>>()?;
    Ok(FileDiff {
        path: file_path.to_owned(),
        old_path,
        is_binary: false,
        is_truncated: false,
        hunks,
    })
}

fn empty(path: &str) -> FileDiff {
    FileDiff {
        path: path.to_owned(),
        old_path: None,
        is_binary: false,
        is_truncated: false,
        hunks: Vec::new(),
    }
}

fn hunk(patch: &Patch<'_>, index: usize) -> Result<Hunk, RepositoryError> {
    let (header, line_count) = patch.hunk(index).map_err(|error| git_error(&error))?;
    let mut lines = Vec::with_capacity(line_count);
    for line_index in 0..line_count {
        let line = patch
            .line_in_hunk(index, line_index)
            .map_err(|error| git_error(&error))?;
        let kind = match line.origin_value() {
            DiffLineType::Addition => LineKind::Added,
            DiffLineType::Deletion => LineKind::Removed,
            DiffLineType::Context => LineKind::Context,
            // "No newline at end of file" markers carry no content to show.
            _ => continue,
        };
        lines.push(DiffLine {
            kind,
            old_number: line.old_lineno(),
            new_number: line.new_lineno(),
            content: String::from_utf8_lossy(line.content())
                .trim_end_matches(['\n', '\r'])
                .to_owned(),
        });
    }
    Ok(Hunk {
        header: String::from_utf8_lossy(header.header())
            .trim_end()
            .to_owned(),
        old_start: header.old_start(),
        old_lines: header.old_lines(),
        new_start: header.new_start(),
        new_lines: header.new_lines(),
        lines,
    })
}

/// A unified-diff patch holding only hunk `index` of `diff`'s single file,
/// ready for `git apply`. Returns `None` if the hunk does not exist or its
/// header differs from `expected_header`.
///
/// # Errors
/// [`RepositoryError::Git`] when libgit2 cannot produce the patch.
/// Which lines of a hunk to keep, and whether the patch will be applied in
/// reverse (unstaging or discarding), which decides how unselected lines
/// are neutralised.
#[derive(Debug, Clone, Copy)]
pub struct LineSelection<'a> {
    pub lines: &'a [usize],
    pub reverse: bool,
}

pub fn hunk_patch(
    diff: &Diff<'_>,
    index: usize,
    expected_header: &str,
    selection: Option<LineSelection<'_>>,
) -> Result<Option<String>, RepositoryError> {
    let Some(delta) = diff.deltas().next() else {
        return Ok(None);
    };
    let Some(patch) = Patch::from_diff(diff, 0).map_err(|error| git_error(&error))? else {
        return Ok(None);
    };
    if index >= patch.num_hunks() {
        return Ok(None);
    }
    let (header, line_count) = patch.hunk(index).map_err(|error| git_error(&error))?;
    let header_text = String::from_utf8_lossy(header.header()).into_owned();
    if header_text.trim_end() != expected_header {
        return Ok(None);
    }

    let path_of = |file: git2::DiffFile<'_>| {
        file.path()
            .map(|path| path.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default()
    };
    let (old, new) = (path_of(delta.old_file()), path_of(delta.new_file()));
    let mut text = format!("diff --git a/{old} b/{new}\n--- a/{old}\n+++ b/{new}\n{header_text}");
    if !text.ends_with('\n') {
        text.push('\n');
    }
    // Index among the lines the UI shows (it skips end-of-file markers).
    let mut shown = 0;
    // Whether the previous line made it into the patch, for its marker.
    let mut kept_previous = true;
    for line_index in 0..line_count {
        let line = patch
            .line_in_hunk(index, line_index)
            .map_err(|error| git_error(&error))?;
        let selected = selection.is_none_or(|selection| selection.lines.contains(&shown));
        let reverse = selection.is_some_and(|selection| selection.reverse);
        let prefix = match (line.origin_value(), selected, reverse) {
            (DiffLineType::Context, ..) => Some(' '),
            (DiffLineType::Addition, true, _) => Some('+'),
            (DiffLineType::Deletion, true, _) => Some('-'),
            // An unselected change must leave its side untouched: in the
            // direction of application the line already is (or stays) there.
            (DiffLineType::Addition, false, true) | (DiffLineType::Deletion, false, false) => {
                Some(' ')
            }
            (DiffLineType::Addition | DiffLineType::Deletion, false, _) => None,
            _ => {
                if kept_previous {
                    text.push_str("\\ No newline at end of file\n");
                }
                continue;
            }
        };
        shown += 1;
        kept_previous = prefix.is_some();
        let Some(prefix) = prefix else { continue };
        text.push(prefix);
        text.push_str(&String::from_utf8_lossy(line.content()));
        if !text.ends_with('\n') {
            text.push('\n');
        }
    }
    Ok(Some(text))
}

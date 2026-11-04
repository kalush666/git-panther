//! Reading a conflicted file: the parts git merged and the parts it left to
//! the user, between `<<<<<<<` / `=======` / `>>>>>>>` markers.

/// A piece of a conflicted file, in order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConflictChunk {
    /// Text both sides agree on.
    Common(String),
    Conflict {
        mine: String,
        /// The common ancestor's text, when git wrote it (`diff3` style).
        base: Option<String>,
        incoming: String,
    },
}

const START: &str = "<<<<<<<";
const BASE: &str = "|||||||";
const MIDDLE: &str = "=======";
const END: &str = ">>>>>>>";

#[derive(Clone, Copy)]
enum Part {
    Common,
    Ours,
    Base,
    Theirs,
}

/// Whether `line` is a conflict marker of kind `marker` (alone, or followed
/// by a label).
fn is_marker(line: &str, marker: &str) -> bool {
    line.strip_prefix(marker)
        .is_some_and(|rest| rest.chars().next().is_none_or(char::is_whitespace))
}

/// Splits `text` at git's conflict markers. Git's "ours" is the first
/// side; `ours_is_mine` is `false` during a rebase, where it is the branch
/// being rebased onto. Lines keep their line endings.
pub fn parse_conflicts(text: &str, ours_is_mine: bool) -> Vec<ConflictChunk> {
    let mut chunks = Vec::new();
    let mut part = Part::Common;
    let mut common = String::new();
    // The raw lines of an open conflict, kept in case it is never closed.
    let mut raw = String::new();
    let (mut ours, mut base, mut theirs) = (String::new(), None::<String>, String::new());
    for line in text.split_inclusive('\n') {
        match part {
            Part::Common if is_marker(line, START) => {
                if !common.is_empty() {
                    chunks.push(ConflictChunk::Common(std::mem::take(&mut common)));
                }
                raw.push_str(line);
                part = Part::Ours;
                continue;
            }
            Part::Ours if is_marker(line, BASE) => {
                base = Some(String::new());
                part = Part::Base;
            }
            Part::Ours | Part::Base if is_marker(line, MIDDLE) => part = Part::Theirs,
            Part::Theirs if is_marker(line, END) => {
                let (first, second) = (std::mem::take(&mut ours), std::mem::take(&mut theirs));
                let (mine, incoming) = if ours_is_mine {
                    (first, second)
                } else {
                    (second, first)
                };
                chunks.push(ConflictChunk::Conflict {
                    mine,
                    base: base.take(),
                    incoming,
                });
                raw.clear();
                part = Part::Common;
                continue;
            }
            Part::Common => common.push_str(line),
            Part::Ours => ours.push_str(line),
            Part::Base => base.get_or_insert_with(String::new).push_str(line),
            Part::Theirs => theirs.push_str(line),
        }
        if !matches!(part, Part::Common) {
            raw.push_str(line);
        }
    }
    // An unterminated conflict is kept as plain text rather than lost.
    common.push_str(&raw);
    if !common.is_empty() {
        chunks.push(ConflictChunk::Common(common));
    }
    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEXT: &str =
        "top\n<<<<<<< HEAD\nours\n||||||| base\nold\n=======\ntheirs\n>>>>>>> topic\nbottom\n";

    #[test]
    fn splits_common_text_and_conflicts() {
        assert_eq!(
            parse_conflicts(TEXT, true),
            [
                ConflictChunk::Common("top\n".into()),
                ConflictChunk::Conflict {
                    mine: "ours\n".into(),
                    base: Some("old\n".into()),
                    incoming: "theirs\n".into(),
                },
                ConflictChunk::Common("bottom\n".into()),
            ]
        );
    }

    #[test]
    fn swaps_sides_during_a_rebase() {
        let chunks = parse_conflicts(TEXT, false);
        assert!(matches!(
            &chunks[1],
            ConflictChunk::Conflict { mine, incoming, .. } if mine == "theirs\n" && incoming == "ours\n"
        ));
    }

    #[test]
    fn plain_and_unterminated_text_stays_as_it_is() {
        assert_eq!(
            parse_conflicts("a\n=======\nb\n", true),
            [ConflictChunk::Common("a\n=======\nb\n".into())]
        );
        assert_eq!(
            parse_conflicts("a\n<<<<<<< HEAD\nb\n", true),
            [
                ConflictChunk::Common("a\n".into()),
                ConflictChunk::Common("<<<<<<< HEAD\nb\n".into())
            ]
        );
    }
}

//! Behaviour of the lane layout on small, hand-drawn histories.

use panther_domain::commit::{CommitId, CommitNode};
use panther_graph::{GraphLayout, GraphRow, Segment};

fn id(name: &str) -> CommitId {
    use std::fmt::Write;
    let mut hex = name.bytes().fold(String::new(), |mut hex, byte| {
        let _ = write!(hex, "{byte:02x}");
        hex
    });
    hex.truncate(40);
    CommitId::parse(&format!("{hex:0<40}")).unwrap()
}

fn node(name: &str, parents: &[&str]) -> CommitNode {
    CommitNode {
        id: id(name),
        parents: parents.iter().map(|parent| id(parent)).collect(),
    }
}

fn layout(history: &[CommitNode]) -> Vec<GraphRow> {
    let mut layout = GraphLayout::default();
    history.iter().map(|commit| layout.push(commit)).collect()
}

/// Segments as `(from, to)` pairs, ignoring colors.
fn lines(segments: &[Segment]) -> Vec<(u32, u32)> {
    segments
        .iter()
        .map(|segment| (segment.from, segment.to))
        .collect()
}

#[test]
fn linear_history_stays_in_one_lane() {
    let rows = layout(&[node("c3", &["c2"]), node("c2", &["c1"]), node("c1", &[])]);

    assert!(rows.iter().all(|row| row.lane == 0 && row.width == 1));
    assert_eq!(lines(&rows[0].top), []);
    assert_eq!(lines(&rows[0].bottom), [(0, 0)]);
    assert_eq!(lines(&rows[1].top), [(0, 0)]);
    assert_eq!(lines(&rows[2].bottom), []);
    assert!(rows.iter().all(|row| row.color == rows[0].color));
}

#[test]
fn merge_opens_a_lane_that_rejoins_at_the_fork_point() {
    let rows = layout(&[
        node("merge", &["main", "topic"]),
        node("main", &["base"]),
        node("topic", &["base"]),
        node("base", &[]),
    ]);

    let [merge, main, topic, base] = &rows[..] else {
        panic!("expected four rows");
    };
    assert_eq!(
        (merge.lane, lines(&merge.bottom)),
        (0, vec![(0, 0), (0, 1)])
    );
    assert_eq!((main.lane, lines(&main.top)), (0, vec![(0, 0), (1, 1)]));
    assert_eq!(
        (topic.lane, lines(&topic.bottom)),
        (1, vec![(0, 0), (1, 1)])
    );
    assert_eq!((base.lane, lines(&base.top)), (0, vec![(0, 0), (1, 0)]));
    assert_eq!(base.width, 2);
    assert_ne!(main.color, topic.color, "each lane gets its own color");
}

#[test]
fn separate_branch_tips_get_separate_lanes() {
    let rows = layout(&[
        node("feature", &["base"]),
        node("main", &["base"]),
        node("base", &[]),
    ]);

    assert_eq!(rows[0].lane, 0);
    assert_eq!(rows[1].lane, 1);
    assert_eq!(lines(&rows[1].top), [(0, 0)], "a new tip starts in its row");
    assert_eq!(lines(&rows[2].top), [(0, 0), (1, 0)]);
}

#[test]
fn merging_into_an_existing_lane_keeps_that_lane_continuous() {
    let rows = layout(&[
        node("side", &["shared"]),
        node("merge", &["main", "shared"]),
        node("main", &["shared"]),
        node("shared", &[]),
    ]);

    let merge = &rows[1];
    assert_eq!(merge.lane, 1);
    assert_eq!(lines(&merge.bottom), [(1, 0), (0, 0), (1, 1)]);
}

#[test]
fn a_cloned_layout_resumes_exactly_where_it_stopped() {
    let history = [
        node("d", &["c", "x"]),
        node("c", &["b"]),
        node("x", &["b"]),
        node("b", &["a"]),
        node("a", &[]),
    ];
    let expected = layout(&history);

    let mut first_page = GraphLayout::default();
    let mut rows: Vec<GraphRow> = history[..2].iter().map(|c| first_page.push(c)).collect();
    let mut snapshot = first_page.clone();
    rows.extend(history[2..].iter().map(|c| snapshot.push(c)));

    assert_eq!(rows, expected);
}

#[test]
fn closed_lanes_are_reused_instead_of_widening_the_graph() {
    let mut history = Vec::new();
    for round in 0..5 {
        let tip = format!("merge{round}");
        let topic = format!("topic{round}");
        let next = format!("merge{}", round + 1);
        history.push(node(&tip, &[&next, &topic]));
        history.push(node(&topic, &[&next]));
    }
    history.push(node("merge5", &[]));

    let rows = layout(&history);

    assert!(rows.iter().all(|row| row.width <= 2), "{rows:#?}");
}

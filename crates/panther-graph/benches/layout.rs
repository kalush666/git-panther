//! Lane layout throughput on a synthetic 100k-commit history with a merged
//! topic branch every ten commits. Budget: a 2,000-commit page in < 20 ms.

use std::hint::black_box;

use criterion::{Criterion, criterion_group, criterion_main};
use panther_domain::commit::{CommitId, CommitNode};
use panther_graph::GraphLayout;

const COMMITS: usize = 100_000;
const PAGE: usize = 2_000;

fn id(index: usize) -> CommitId {
    CommitId::parse(&format!("{index:040x}")).expect("40 hex digits")
}

/// Mainline commits `0..COMMITS`, where every tenth one merges a 3-commit
/// topic branch that forked from the next mainline commit.
fn synthetic_history() -> Vec<CommitNode> {
    let mut history = Vec::with_capacity(COMMITS + COMMITS / 10 * 3);
    let mut topic_ids = COMMITS;
    for main in 0..COMMITS {
        let next_main = (main + 1 < COMMITS).then(|| id(main + 1));
        if main % 10 == 0 && next_main.is_some() {
            let topic: Vec<CommitId> = (0..3).map(|offset| id(topic_ids + offset)).collect();
            topic_ids += 3;
            history.push(CommitNode {
                id: id(main),
                parents: vec![next_main.clone().unwrap(), topic[0].clone()],
            });
            for (position, commit) in topic.iter().enumerate() {
                let parent = topic
                    .get(position + 1)
                    .cloned()
                    .or_else(|| next_main.clone());
                history.push(CommitNode {
                    id: commit.clone(),
                    parents: parent.into_iter().collect(),
                });
            }
        } else {
            history.push(CommitNode {
                id: id(main),
                parents: next_main.into_iter().collect(),
            });
        }
    }
    history
}

fn bench_layout(criterion: &mut Criterion) {
    let history = synthetic_history();

    criterion.bench_function("layout one 2k page", |bench| {
        bench.iter(|| {
            let mut layout = GraphLayout::default();
            for commit in &history[..PAGE] {
                black_box(layout.push(commit));
            }
        });
    });

    criterion.bench_function("layout full 130k history", |bench| {
        bench.iter(|| {
            let mut layout = GraphLayout::default();
            for commit in &history {
                black_box(layout.push(commit));
            }
        });
    });
}

criterion_group!(benches, bench_layout);
criterion_main!(benches);

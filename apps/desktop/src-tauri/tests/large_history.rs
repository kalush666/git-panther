//! Performance budget for opening the commit graph of a very large repository.
//!
//! Opt-in, because it needs a generated fixture:
//!
//! ```text
//! node scripts/make-large-repo.mjs <dir> 100000
//! GIT_PANTHER_LARGE_REPO=<dir> cargo test --release -p git-panther --test large_history -- --ignored --nocapture
//! ```

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use panther_application::commit_graph::CommitGraph;
use panther_git::GitCommitLog;

const FIRST_PAGE: usize = 200;
/// First paint of a 100k-commit repository: history walk, layout and the
/// first page of summaries.
const FIRST_PAGE_BUDGET: Duration = Duration::from_secs(1);
/// Scrolling to a later page reuses the cached history.
const NEXT_PAGE_BUDGET: Duration = Duration::from_millis(50);

#[test]
#[ignore = "needs GIT_PANTHER_LARGE_REPO pointing at a generated fixture"]
fn opens_a_large_history_within_budget() {
    let repository = PathBuf::from(
        std::env::var_os("GIT_PANTHER_LARGE_REPO").expect("set GIT_PANTHER_LARGE_REPO"),
    );
    let graph = CommitGraph::new(Arc::new(GitCommitLog::default()));

    let started = Instant::now();
    let first = graph.page(&repository, 0, FIRST_PAGE, &[]).unwrap();
    let first_page = started.elapsed();

    let started = Instant::now();
    let middle = graph
        .page(&repository, first.total / 2, FIRST_PAGE, &[])
        .unwrap();
    let next_page = started.elapsed();

    println!(
        "{} commits: first page {first_page:?}, middle page {next_page:?}",
        first.total
    );
    assert_eq!(middle.entries.len(), FIRST_PAGE);
    assert!(
        first_page < FIRST_PAGE_BUDGET,
        "first page took {first_page:?}"
    );
    assert!(
        next_page < NEXT_PAGE_BUDGET,
        "middle page took {next_page:?}"
    );
}

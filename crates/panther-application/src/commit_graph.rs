//! Use case: page through a repository's commit graph.
//!
//! History and layout are cached per repository until any ref moves, so
//! scrolling only pays for the commits on screen.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use panther_domain::commit::{CommitDetails, CommitId, CommitNode, CommitSummary, RefLabel};
use panther_domain::ports::CommitLog;
use panther_domain::repository::RepositoryError;
use panther_domain::working_tree::FileDiff;
use panther_graph::{GraphLayout, GraphRow};

/// Largest page a caller may request.
pub const MAX_PAGE_SIZE: usize = 2_000;

/// One row of the commit list: the commit, its graph row and its labels.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GraphEntry {
    pub commit: CommitSummary,
    pub row: GraphRow,
    pub refs: Vec<RefLabel>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GraphPage {
    /// Number of commits in the whole history.
    pub total: usize,
    pub offset: usize,
    pub entries: Vec<GraphEntry>,
}

struct CachedHistory {
    fingerprint: String,
    nodes: Vec<CommitNode>,
    refs: HashMap<CommitId, Vec<RefLabel>>,
    rows: Vec<GraphRow>,
    layout: GraphLayout,
}

impl CachedHistory {
    fn rows_until(&mut self, end: usize) -> &[GraphRow] {
        while self.rows.len() < end {
            let row = self.layout.push(&self.nodes[self.rows.len()]);
            self.rows.push(row);
        }
        &self.rows[..end]
    }
}

pub struct CommitGraph {
    log: Arc<dyn CommitLog>,
    cache: Mutex<HashMap<PathBuf, CachedHistory>>,
}

impl CommitGraph {
    pub fn new(log: Arc<dyn CommitLog>) -> Self {
        Self {
            log,
            cache: Mutex::default(),
        }
    }

    /// Up to `limit` (at most [`MAX_PAGE_SIZE`]) rows starting at `offset`.
    ///
    /// # Errors
    /// Propagates [`CommitLog`] errors.
    pub fn page(
        &self,
        repository: &Path,
        offset: usize,
        limit: usize,
    ) -> Result<GraphPage, RepositoryError> {
        let fingerprint = self.log.refs_fingerprint(repository)?;
        let (total, ids, rows, refs) = {
            let mut cache = self.lock();
            let history = self.fresh_history(&mut cache, repository, fingerprint)?;
            let total = history.nodes.len();
            let start = offset.min(total);
            let end = start.saturating_add(limit.min(MAX_PAGE_SIZE)).min(total);
            let rows = history.rows_until(end)[start..end].to_vec();
            let ids: Vec<CommitId> = history.nodes[start..end]
                .iter()
                .map(|node| node.id.clone())
                .collect();
            let refs: Vec<Vec<RefLabel>> = ids
                .iter()
                .map(|id| history.refs.get(id).cloned().unwrap_or_default())
                .collect();
            (total, ids, rows, refs)
        };

        let summaries = self.log.summaries(repository, &ids)?;
        let entries = summaries
            .into_iter()
            .zip(rows)
            .zip(refs)
            .map(|((commit, row), refs)| GraphEntry { commit, row, refs })
            .collect();
        Ok(GraphPage {
            total,
            offset: offset.min(total),
            entries,
        })
    }

    /// # Errors
    /// [`RepositoryError::CommitNotFound`] if `id` is unknown.
    pub fn details(
        &self,
        repository: &Path,
        id: &CommitId,
    ) -> Result<CommitDetails, RepositoryError> {
        self.log.details(repository, id)
    }

    /// How `path` changed in commit `id`.
    ///
    /// # Errors
    /// [`RepositoryError::CommitNotFound`] if `id` is unknown.
    pub fn commit_file_diff(
        &self,
        repository: &Path,
        id: &CommitId,
        path: &str,
    ) -> Result<FileDiff, RepositoryError> {
        self.log.commit_file_diff(repository, id, path)
    }

    /// Drops cached history, e.g. when a repository tab closes.
    pub fn forget(&self, repository: &Path) {
        self.lock().remove(repository);
    }

    fn fresh_history<'cache>(
        &self,
        cache: &'cache mut HashMap<PathBuf, CachedHistory>,
        repository: &Path,
        fingerprint: String,
    ) -> Result<&'cache mut CachedHistory, RepositoryError> {
        let is_stale = cache
            .get(repository)
            .is_none_or(|cached| cached.fingerprint != fingerprint);
        if is_stale {
            let nodes = self.log.history(repository)?;
            let refs = group_by_target(self.log.refs(repository)?);
            cache.insert(
                repository.to_path_buf(),
                CachedHistory {
                    fingerprint,
                    nodes,
                    refs,
                    rows: Vec::new(),
                    layout: GraphLayout::default(),
                },
            );
        }
        Ok(cache
            .get_mut(repository)
            .expect("history was cached just above"))
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<PathBuf, CachedHistory>> {
        // Each cache entry is replaced whole, so a poisoned lock still holds
        // consistent entries.
        self.cache.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

fn group_by_target(refs: Vec<RefLabel>) -> HashMap<CommitId, Vec<RefLabel>> {
    let mut grouped: HashMap<CommitId, Vec<RefLabel>> = HashMap::new();
    for label in refs {
        grouped.entry(label.target.clone()).or_default().push(label);
    }
    grouped
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use panther_domain::commit::{Person, RefKind};

    use super::*;

    fn id(index: usize) -> CommitId {
        CommitId::parse(&format!("{index:040x}")).unwrap()
    }

    /// A linear history `0 → 1 → … → n-1` with `main` on commit 0.
    struct FakeLog {
        commits: usize,
        fingerprint: Mutex<String>,
        history_reads: AtomicUsize,
    }

    impl FakeLog {
        fn new(commits: usize) -> Self {
            Self {
                commits,
                fingerprint: Mutex::new("v1".into()),
                history_reads: AtomicUsize::new(0),
            }
        }
    }

    impl CommitLog for FakeLog {
        fn refs_fingerprint(&self, _: &Path) -> Result<String, RepositoryError> {
            Ok(self.fingerprint.lock().unwrap().clone())
        }

        fn history(&self, _: &Path) -> Result<Vec<CommitNode>, RepositoryError> {
            self.history_reads.fetch_add(1, Ordering::SeqCst);
            Ok((0..self.commits)
                .map(|index| CommitNode {
                    id: id(index),
                    parents: (index + 1 < self.commits)
                        .then(|| id(index + 1))
                        .into_iter()
                        .collect(),
                })
                .collect())
        }

        fn summaries(
            &self,
            _: &Path,
            ids: &[CommitId],
        ) -> Result<Vec<CommitSummary>, RepositoryError> {
            Ok(ids
                .iter()
                .map(|id| CommitSummary {
                    id: id.clone(),
                    parents: Vec::new(),
                    summary: format!("commit {}", id.short()),
                    body_preview: String::new(),
                    author: Person {
                        name: "Dev".into(),
                        email: "dev@example.invalid".into(),
                        time: 0,
                    },
                })
                .collect())
        }

        fn refs(&self, _: &Path) -> Result<Vec<RefLabel>, RepositoryError> {
            Ok(vec![RefLabel {
                name: "main".into(),
                kind: RefKind::LocalBranch,
                target: id(0),
                is_head: true,
            }])
        }

        fn details(&self, _: &Path, id: &CommitId) -> Result<CommitDetails, RepositoryError> {
            Err(RepositoryError::CommitNotFound { id: id.to_string() })
        }

        fn commit_file_diff(
            &self,
            _: &Path,
            id: &CommitId,
            _: &str,
        ) -> Result<FileDiff, RepositoryError> {
            Err(RepositoryError::CommitNotFound { id: id.to_string() })
        }
    }

    fn graph(commits: usize) -> (CommitGraph, Arc<FakeLog>) {
        let log = Arc::new(FakeLog::new(commits));
        (
            CommitGraph::new(Arc::clone(&log) as Arc<dyn CommitLog>),
            log,
        )
    }

    const REPO: &str = "/repos/app";

    #[test]
    fn returns_the_requested_window_with_labels() {
        let (graph, _) = graph(10);
        let page = graph.page(Path::new(REPO), 0, 3).unwrap();

        assert_eq!(page.total, 10);
        assert_eq!(page.entries.len(), 3);
        assert_eq!(page.entries[0].commit.id, id(0));
        assert_eq!(page.entries[0].refs[0].name, "main");
        assert_eq!(page.entries[1].refs, Vec::<RefLabel>::new());
    }

    #[test]
    fn clamps_pages_past_the_end() {
        let (graph, _) = graph(5);
        let page = graph.page(Path::new(REPO), 3, 100).unwrap();
        assert_eq!(page.entries.len(), 2);

        let beyond = graph.page(Path::new(REPO), 50, 10).unwrap();
        assert_eq!((beyond.offset, beyond.entries.len()), (5, 0));
    }

    #[test]
    fn caps_the_page_size() {
        let (graph, _) = graph(MAX_PAGE_SIZE + 10);
        let page = graph.page(Path::new(REPO), 0, usize::MAX).unwrap();
        assert_eq!(page.entries.len(), MAX_PAGE_SIZE);
    }

    #[test]
    fn reads_history_once_until_refs_move() {
        let (graph, log) = graph(20);
        graph.page(Path::new(REPO), 0, 5).unwrap();
        graph.page(Path::new(REPO), 5, 5).unwrap();
        assert_eq!(log.history_reads.load(Ordering::SeqCst), 1);

        *log.fingerprint.lock().unwrap() = "v2".into();
        graph.page(Path::new(REPO), 0, 5).unwrap();
        assert_eq!(log.history_reads.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn later_pages_continue_the_same_layout() {
        let (graph, _) = graph(10);
        let whole = graph.page(Path::new(REPO), 0, 10).unwrap();
        graph.forget(Path::new(REPO));
        graph.page(Path::new(REPO), 0, 4).unwrap();
        let tail = graph.page(Path::new(REPO), 4, 6).unwrap();

        assert_eq!(tail.entries, whole.entries[4..]);
    }
}

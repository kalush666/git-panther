//! Composition root: the only place that knows concrete adapter types.

use std::path::Path;
use std::sync::Arc;

use panther_application::check_git_installation::CheckGitInstallation;
use panther_application::clone_repository::CloneRepository;
use panther_application::commit_graph::CommitGraph;
use panther_application::open_repository::OpenRepository;
use panther_application::recent_repositories::RecentRepositoryList;
use panther_git::{Git2RepositoryOpener, GitCliCloner, GitCommitLog, SystemGitProbe};

use crate::infra::recent_store::JsonRecentRepositoryStore;

const RECENT_REPOSITORIES_FILE: &str = "recent-repositories.json";

/// Use cases available to IPC commands, shared as Tauri managed state.
pub struct AppServices {
    pub check_git_installation: Arc<CheckGitInstallation>,
    pub open_repository: Arc<OpenRepository>,
    pub clone_repository: Arc<CloneRepository>,
    pub recent_repositories: Arc<RecentRepositoryList>,
    pub commit_graph: Arc<CommitGraph>,
}

impl AppServices {
    /// Wires every use case to its production adapters. `config_dir` holds
    /// the app's persisted state.
    pub fn new(config_dir: &Path) -> Self {
        let recent_store = Arc::new(JsonRecentRepositoryStore::new(
            config_dir.join(RECENT_REPOSITORIES_FILE),
        ));
        let recent_repositories = Arc::new(RecentRepositoryList::new(recent_store));
        let open_repository = Arc::new(OpenRepository::new(
            Arc::new(Git2RepositoryOpener),
            Arc::clone(&recent_repositories),
        ));
        Self {
            check_git_installation: Arc::new(CheckGitInstallation::new(Arc::new(
                SystemGitProbe::default(),
            ))),
            clone_repository: Arc::new(CloneRepository::new(
                Arc::new(GitCliCloner::default()),
                Arc::clone(&open_repository),
            )),
            commit_graph: Arc::new(CommitGraph::new(Arc::new(GitCommitLog::default()))),
            open_repository,
            recent_repositories,
        }
    }
}

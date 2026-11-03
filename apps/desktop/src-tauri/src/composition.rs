//! Composition root: the only place that knows concrete adapter types.

use std::path::Path;
use std::sync::Arc;

use panther_application::branches::Branches;
use panther_application::check_git_installation::CheckGitInstallation;
use panther_application::clone_repository::CloneRepository;
use panther_application::commit_graph::CommitGraph;
use panther_application::conflicts::Conflicts;
use panther_application::open_repository::OpenRepository;
use panther_application::recent_repositories::RecentRepositoryList;
use panther_application::settings::AppSettings;
use panther_application::stashes::Stashes;
use panther_application::sync::Sync;
use panther_application::working_copy::WorkingCopy;
use panther_git::{
    Git2RepositoryOpener, GitBranchStore, GitCliCloner, GitCommitLog, GitCommitWriter,
    GitConflictResolver, GitRemoteSync, GitStashStore, GitWorkingTree, SystemGitProbe,
};

use crate::infra::recent_store::JsonRecentRepositoryStore;
use crate::infra::settings_store::JsonSettingsStore;

const RECENT_REPOSITORIES_FILE: &str = "recent-repositories.json";
const SETTINGS_FILE: &str = "settings.json";

/// Use cases available to IPC commands, shared as Tauri managed state.
pub struct AppServices {
    pub check_git_installation: Arc<CheckGitInstallation>,
    pub open_repository: Arc<OpenRepository>,
    pub clone_repository: Arc<CloneRepository>,
    pub recent_repositories: Arc<RecentRepositoryList>,
    pub commit_graph: Arc<CommitGraph>,
    pub working_copy: Arc<WorkingCopy>,
    pub branches: Arc<Branches>,
    pub sync: Arc<Sync>,
    pub stashes: Arc<Stashes>,
    pub conflicts: Arc<Conflicts>,
    pub settings: Arc<AppSettings>,
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
        let settings = Arc::new(AppSettings::new(
            Arc::new(JsonSettingsStore::new(config_dir.join(SETTINGS_FILE))),
            Arc::new(SystemGitProbe),
        ));
        // Unreadable settings must not keep the app from starting: fall back
        // to git from PATH, and the settings screen shows the problem.
        let git = settings
            .load()
            .unwrap_or_default()
            .git_executable()
            .to_path_buf();
        Self {
            check_git_installation: Arc::new(CheckGitInstallation::new(
                Arc::new(SystemGitProbe),
                git.clone(),
            )),
            clone_repository: Arc::new(CloneRepository::new(
                Arc::new(GitCliCloner::new(git.clone())),
                Arc::clone(&open_repository),
            )),
            commit_graph: Arc::new(CommitGraph::new(Arc::new(GitCommitLog::new(git.clone())))),
            branches: Arc::new(Branches::new(Arc::new(GitBranchStore::new(git.clone())))),
            sync: Arc::new(Sync::new(Arc::new(GitRemoteSync::new(git.clone())))),
            stashes: Arc::new(Stashes::new(Arc::new(GitStashStore::new(git.clone())))),
            conflicts: Arc::new(Conflicts::new(Arc::new(GitConflictResolver::new(
                git.clone(),
            )))),
            working_copy: Arc::new(WorkingCopy::new(
                Arc::new(GitWorkingTree::new(git.clone())),
                Arc::new(GitCommitWriter::new(git)),
            )),
            settings,
            open_repository,
            recent_repositories,
        }
    }
}

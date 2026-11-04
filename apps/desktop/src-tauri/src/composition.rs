//! Composition root: the only place that knows concrete adapter types.

use std::path::Path;
use std::sync::Arc;

use panther_application::accounts::Accounts;
use panther_application::branches::Branches;
use panther_application::check_git_installation::CheckGitInstallation;
use panther_application::clone_repository::CloneRepository;
use panther_application::commit_graph::CommitGraph;
use panther_application::conflicts::Conflicts;
use panther_application::history::History;
use panther_application::layout::Layout;
use panther_application::open_repository::OpenRepository;
use panther_application::recent_repositories::RecentRepositoryList;
use panther_application::remotes::Remotes;
use panther_application::settings::AppSettings;
use panther_application::stashes::Stashes;
use panther_application::sync::Sync;
use panther_application::undo::UndoLog;
use panther_application::working_copy::WorkingCopy;
use panther_git::{
    Git2RepositoryOpener, GitBranchStore, GitCliCloner, GitCommitLog, GitCommitWriter,
    GitConflictResolver, GitCredentialStore, GitHistoryEditor, GitRemoteConfig, GitRemoteSync,
    GitRepositoryLayout, GitStashStore, GitTagStore, GitWorkingTree, SystemGitProbe,
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
    pub accounts: Arc<Accounts>,
    pub history: Arc<History>,
    pub remotes: Arc<Remotes>,
    pub layout: Arc<Layout>,
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
        let settings_store = Arc::new(JsonSettingsStore::new(config_dir.join(SETTINGS_FILE)));
        let settings = Arc::new(AppSettings::new(
            settings_store.clone(),
            Arc::new(SystemGitProbe),
        ));
        // Unreadable settings must not keep the app from starting: fall back
        // to git from PATH, and the settings screen shows the problem.
        let git = settings
            .load()
            .unwrap_or_default()
            .git_executable()
            .to_path_buf();
        let history_editor = Arc::new(GitHistoryEditor::new(git.clone()));
        let undo = Arc::new(UndoLog::new(
            history_editor.clone(),
            Arc::new(GitBranchStore::new(git.clone())),
            Arc::new(GitStashStore::new(git.clone())),
        ));
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
            branches: Arc::new(
                Branches::new(Arc::new(GitBranchStore::new(git.clone()))).with_undo(undo.clone()),
            ),
            remotes: Arc::new(Remotes::new(Arc::new(GitRemoteConfig::new(git.clone())))),
            layout: Arc::new(Layout::new(Arc::new(GitRepositoryLayout::new(git.clone())))),
            history: Arc::new(History::new(
                history_editor,
                Arc::new(GitTagStore::new(git.clone())),
                Arc::new(GitCommitLog::new(git.clone())),
                undo.clone(),
            )),
            accounts: Arc::new(Accounts::new(
                Arc::new(GitCredentialStore::new(git.clone())),
                settings_store,
                Arc::new(GitRemoteSync::new(git.clone())),
            )),
            sync: Arc::new(
                Sync::new(Arc::new(GitRemoteSync::new(git.clone()))).with_undo(undo.clone()),
            ),
            stashes: Arc::new(
                Stashes::new(Arc::new(GitStashStore::new(git.clone()))).with_undo(undo.clone()),
            ),
            conflicts: Arc::new(Conflicts::new(Arc::new(GitConflictResolver::new(
                git.clone(),
            )))),
            working_copy: Arc::new(
                WorkingCopy::new(
                    Arc::new(GitWorkingTree::new(git.clone())),
                    Arc::new(GitCommitWriter::new(git)),
                )
                .with_undo(undo),
            ),
            settings,
            open_repository,
            recent_repositories,
        }
    }
}

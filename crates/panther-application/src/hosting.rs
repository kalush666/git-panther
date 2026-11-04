//! Use cases: connect code review servers, and list and open merge / pull
//! requests and issues of a repository's project.

use std::path::Path;
use std::sync::Arc;

use panther_domain::account::{Password, Server};
use panther_domain::hosting::{
    HostedProject, HostingAccess, HostingKind, Issue, NewPullRequest, PullRequest,
};
use panther_domain::ports::{CredentialStore, HostingProvider, RemoteSync, SettingsStore};
use panther_domain::repository::RepositoryError;

/// The remote preferred when a repository has several.
const PREFERRED_REMOTE: &str = "origin";

/// A repository's project, and whether its server is connected.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostingStatus {
    pub project: HostedProject,
    /// `None` until the user connects the server.
    pub kind: Option<HostingKind>,
}

pub struct Hosting {
    settings: Arc<dyn SettingsStore>,
    credentials: Arc<dyn CredentialStore>,
    remotes: Arc<dyn RemoteSync>,
    gitlab: Arc<dyn HostingProvider>,
    github: Arc<dyn HostingProvider>,
}

impl Hosting {
    pub fn new(
        settings: Arc<dyn SettingsStore>,
        credentials: Arc<dyn CredentialStore>,
        remotes: Arc<dyn RemoteSync>,
        gitlab: Arc<dyn HostingProvider>,
        github: Arc<dyn HostingProvider>,
    ) -> Self {
        Self {
            settings,
            credentials,
            remotes,
            gitlab,
            github,
        }
    }

    fn provider(&self, kind: HostingKind) -> &dyn HostingProvider {
        match kind {
            HostingKind::GitLab => self.gitlab.as_ref(),
            HostingKind::GitHub => self.github.as_ref(),
        }
    }

    /// # Errors
    /// Propagates [`SettingsStore::load`] errors.
    pub fn connections(&self) -> Result<Vec<HostingAccess>, RepositoryError> {
        Ok(self.settings.load()?.hosting)
    }

    /// Checks `token` against `server`, then keeps it in the credential
    /// helper and remembers the connection.
    ///
    /// # Errors
    /// Invalid input, [`RepositoryError::HostingUnauthorized`], a network or
    /// a storage error.
    pub fn connect(
        &self,
        server: &str,
        kind: HostingKind,
        token: String,
    ) -> Result<HostingAccess, RepositoryError> {
        let server = Server::parse(server)?;
        let token = Password::new(token)?;
        self.provider(kind).check(&server, &token)?;
        self.credentials.store_token(&server, &token)?;
        let access = HostingAccess { server, kind };
        let mut settings = self.settings.load()?;
        settings
            .hosting
            .retain(|existing| existing.server != access.server);
        settings.hosting.push(access.clone());
        self.settings.save(&settings)?;
        Ok(access)
    }

    /// Forgets the token and the connection.
    ///
    /// # Errors
    /// Invalid input, or a credential helper or storage error.
    pub fn disconnect(&self, server: &str) -> Result<(), RepositoryError> {
        let server = Server::parse(server)?;
        self.credentials.erase_token(&server)?;
        let mut settings = self.settings.load()?;
        settings
            .hosting
            .retain(|existing| existing.server != server);
        self.settings.save(&settings)
    }

    /// The project `repository` belongs to, `origin` first, if any remote
    /// points to a server at all.
    ///
    /// # Errors
    /// Propagates remote listing and settings errors.
    pub fn status(&self, repository: &Path) -> Result<Option<HostingStatus>, RepositoryError> {
        let mut remotes = self.remotes.remotes(repository)?;
        remotes.sort_by_key(|remote| remote.name != PREFERRED_REMOTE);
        let Some(project) = remotes
            .iter()
            .find_map(|remote| HostedProject::from_remote_url(&remote.url))
        else {
            return Ok(None);
        };
        let kind = self
            .settings
            .load()?
            .hosting
            .into_iter()
            .find(|access| access.server == project.server)
            .map(|access| access.kind);
        Ok(Some(HostingStatus { project, kind }))
    }

    /// # Errors
    /// [`RepositoryError::NoHostedProject`], [`RepositoryError::HostingNotConnected`]
    /// or provider errors.
    pub fn pull_requests(&self, repository: &Path) -> Result<Vec<PullRequest>, RepositoryError> {
        let (project, provider, token) = self.session(repository)?;
        provider.pull_requests(&project, &token)
    }

    /// # Errors
    /// Like [`Hosting::pull_requests`].
    pub fn issues(&self, repository: &Path) -> Result<Vec<Issue>, RepositoryError> {
        let (project, provider, token) = self.session(repository)?;
        provider.issues(&project, &token)
    }

    /// # Errors
    /// Like [`Hosting::pull_requests`].
    pub fn create_pull_request(
        &self,
        repository: &Path,
        request: &NewPullRequest,
    ) -> Result<PullRequest, RepositoryError> {
        let (project, provider, token) = self.session(repository)?;
        provider.create_pull_request(&project, &token, request)
    }

    fn session(
        &self,
        repository: &Path,
    ) -> Result<(HostedProject, &dyn HostingProvider, Password), RepositoryError> {
        let status = self
            .status(repository)?
            .ok_or(RepositoryError::NoHostedProject)?;
        let not_connected = || RepositoryError::HostingNotConnected {
            server: status.project.server.to_string(),
        };
        let kind = status.kind.ok_or_else(not_connected)?;
        let token = self
            .credentials
            .token(&status.project.server)?
            .ok_or_else(not_connected)?;
        Ok((status.project, self.provider(kind), token))
    }
}

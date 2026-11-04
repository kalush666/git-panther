//! Use cases: connect code review servers, and list and open merge / pull
//! requests and issues of a repository's project.

use std::path::Path;
use std::sync::Arc;

use panther_domain::account::{Account, Password, Server};
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
        self.remember(HostingAccess { server, kind })
    }

    /// Connects a GitLab `server` with the personal number and password the
    /// user signed in to git with, so no access token is needed. The API
    /// token GitLab hands back is renewed the same way when it runs out.
    ///
    /// # Errors
    /// [`RepositoryError::AuthenticationFailed`] when there is no sign-in for
    /// `server` yet, [`RepositoryError::HostingLoginUnsupported`] when the
    /// server only takes access tokens, or a network or storage error.
    pub fn connect_with_login(&self, server: &str) -> Result<HostingAccess, RepositoryError> {
        let server = Server::parse(server)?;
        self.renew_token(&server)?;
        self.remember(HostingAccess {
            server,
            kind: HostingKind::GitLab,
        })
    }

    /// Trades the stored git sign-in of `server` for a new API token and keeps it.
    fn renew_token(&self, server: &Server) -> Result<Password, RepositoryError> {
        let signed_out = || RepositoryError::AuthenticationFailed {
            details: format!("Sign in to {server} first."),
        };
        let account: Account = self
            .settings
            .load()?
            .accounts
            .into_iter()
            .rev()
            .find(|account| &account.server == server)
            .ok_or_else(signed_out)?;
        let password = self
            .credentials
            .password(&account)?
            .ok_or_else(signed_out)?;
        let token = self
            .gitlab
            .token_from_login(&account, &password)?
            .ok_or_else(|| RepositoryError::HostingLoginUnsupported {
                server: server.to_string(),
            })?;
        self.credentials.store_token(server, &token)?;
        Ok(token)
    }

    fn remember(&self, access: HostingAccess) -> Result<HostingAccess, RepositoryError> {
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
        self.with_session(repository, |provider, project, token| {
            provider.pull_requests(project, token)
        })
    }

    /// # Errors
    /// Like [`Hosting::pull_requests`].
    pub fn issues(&self, repository: &Path) -> Result<Vec<Issue>, RepositoryError> {
        self.with_session(repository, |provider, project, token| {
            provider.issues(project, token)
        })
    }

    /// # Errors
    /// Like [`Hosting::pull_requests`].
    pub fn create_pull_request(
        &self,
        repository: &Path,
        request: &NewPullRequest,
    ) -> Result<PullRequest, RepositoryError> {
        self.with_session(repository, |provider, project, token| {
            provider.create_pull_request(project, token, request)
        })
    }

    /// Runs `call` with the project's provider and token. When a GitLab
    /// server refuses the token (OAuth tokens run out after a few hours), it
    /// is renewed from the git sign-in and `call` runs once more.
    fn with_session<T>(
        &self,
        repository: &Path,
        call: impl Fn(&dyn HostingProvider, &HostedProject, &Password) -> Result<T, RepositoryError>,
    ) -> Result<T, RepositoryError> {
        let status = self
            .status(repository)?
            .ok_or(RepositoryError::NoHostedProject)?;
        let project = status.project;
        let not_connected = || RepositoryError::HostingNotConnected {
            server: project.server.to_string(),
        };
        let kind = status.kind.ok_or_else(not_connected)?;
        let provider = self.provider(kind);
        let renewable = kind == HostingKind::GitLab;
        let token = match self.credentials.token(&project.server)? {
            Some(token) => token,
            None if renewable => self
                .renew_token(&project.server)
                .map_err(|_| not_connected())?,
            None => return Err(not_connected()),
        };
        match call(provider, &project, &token) {
            Err(refused @ RepositoryError::HostingUnauthorized { .. }) if renewable => {
                let Ok(token) = self.renew_token(&project.server) else {
                    return Err(refused);
                };
                call(provider, &project, &token)
            }
            result => result,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use panther_domain::remote::{PullStrategy, PushOptions, Remote};
    use panther_domain::repository::{CancellationToken, CloneProgress};
    use panther_domain::settings::Settings;

    use super::*;

    const SERVER: &str = "https://gitlab.example.internal";
    const REPOSITORY: &str = "C:/repos/app";

    struct MemorySettings(Mutex<Settings>);

    impl SettingsStore for MemorySettings {
        fn load(&self) -> Result<Settings, RepositoryError> {
            Ok(self.0.lock().unwrap().clone())
        }

        fn save(&self, settings: &Settings) -> Result<(), RepositoryError> {
            *self.0.lock().unwrap() = settings.clone();
            Ok(())
        }
    }

    /// Keeps the git password of the signed-in account and the API token.
    #[derive(Default)]
    struct Vault {
        password: Option<String>,
        token: Mutex<Option<String>>,
    }

    impl CredentialStore for Vault {
        fn has_helper(&self) -> Result<bool, RepositoryError> {
            Ok(true)
        }

        fn store(&self, _: &Account, _: &Password) -> Result<(), RepositoryError> {
            unreachable!("connecting keeps no git password")
        }

        fn erase(&self, _: &Account) -> Result<(), RepositoryError> {
            unreachable!("connecting erases no git password")
        }

        fn store_token(&self, _: &Server, token: &Password) -> Result<(), RepositoryError> {
            *self.token.lock().unwrap() = Some(token.expose().to_owned());
            Ok(())
        }

        fn token(&self, _: &Server) -> Result<Option<Password>, RepositoryError> {
            Ok(self
                .token
                .lock()
                .unwrap()
                .clone()
                .map(|token| Password::new(token).unwrap()))
        }

        fn erase_token(&self, _: &Server) -> Result<(), RepositoryError> {
            *self.token.lock().unwrap() = None;
            Ok(())
        }

        fn password(&self, _: &Account) -> Result<Option<Password>, RepositoryError> {
            Ok(self
                .password
                .clone()
                .map(|password| Password::new(password).unwrap()))
        }

        fn verify(&self, _: &str) -> Result<(), RepositoryError> {
            unreachable!("connecting verifies no remote")
        }
    }

    struct OriginOnServer;

    impl RemoteSync for OriginOnServer {
        fn remotes(&self, _: &Path) -> Result<Vec<Remote>, RepositoryError> {
            Ok(vec![Remote {
                name: "origin".into(),
                url: format!("{SERVER}/team/app.git"),
            }])
        }

        fn fetch(
            &self,
            _: &Path,
            _: &mut dyn FnMut(CloneProgress),
            _: &CancellationToken,
        ) -> Result<(), RepositoryError> {
            unreachable!()
        }

        fn pull(
            &self,
            _: &Path,
            _: PullStrategy,
            _: &mut dyn FnMut(CloneProgress),
            _: &CancellationToken,
        ) -> Result<(), RepositoryError> {
            unreachable!()
        }

        fn push(
            &self,
            _: &Path,
            _: &PushOptions,
            _: &mut dyn FnMut(CloneProgress),
            _: &CancellationToken,
        ) -> Result<(), RepositoryError> {
            unreachable!()
        }
    }

    /// Trades the password "right" for numbered tokens and only accepts the
    /// newest one, so an older token reads as expired.
    #[derive(Default)]
    struct FakeGitLab {
        grants: Mutex<u32>,
        password_grant_off: bool,
    }

    impl FakeGitLab {
        fn current(&self) -> String {
            format!("oauth-{}", self.grants.lock().unwrap())
        }
    }

    impl HostingProvider for FakeGitLab {
        fn check(&self, _: &Server, _: &Password) -> Result<(), RepositoryError> {
            Ok(())
        }

        fn pull_requests(
            &self,
            project: &HostedProject,
            token: &Password,
        ) -> Result<Vec<PullRequest>, RepositoryError> {
            if token.expose() != self.current() {
                return Err(RepositoryError::HostingUnauthorized {
                    server: project.server.to_string(),
                });
            }
            Ok(Vec::new())
        }

        fn create_pull_request(
            &self,
            _: &HostedProject,
            _: &Password,
            _: &NewPullRequest,
        ) -> Result<PullRequest, RepositoryError> {
            unreachable!()
        }

        fn issues(&self, _: &HostedProject, _: &Password) -> Result<Vec<Issue>, RepositoryError> {
            unreachable!()
        }

        fn token_from_login(
            &self,
            account: &Account,
            password: &Password,
        ) -> Result<Option<Password>, RepositoryError> {
            assert_eq!(account.username, "p9493378");
            if self.password_grant_off || password.expose() != "right" {
                return Ok(None);
            }
            *self.grants.lock().unwrap() += 1;
            Ok(Some(Password::new(self.current()).unwrap()))
        }
    }

    fn setup(
        signed_in: bool,
        vault: Vault,
        gitlab: FakeGitLab,
    ) -> (Hosting, Arc<Vault>, Arc<FakeGitLab>) {
        let accounts = if signed_in {
            vec![Account {
                server: Server::parse(SERVER).unwrap(),
                username: "p9493378".into(),
            }]
        } else {
            Vec::new()
        };
        let settings = Arc::new(MemorySettings(Mutex::new(Settings {
            accounts,
            ..Settings::default()
        })));
        let vault = Arc::new(vault);
        let gitlab = Arc::new(gitlab);
        let hosting = Hosting::new(
            settings,
            Arc::clone(&vault) as Arc<dyn CredentialStore>,
            Arc::new(OriginOnServer),
            Arc::clone(&gitlab) as Arc<dyn HostingProvider>,
            Arc::new(FakeGitLab::default()),
        );
        (hosting, vault, gitlab)
    }

    fn signed_in_vault() -> Vault {
        Vault {
            password: Some("right".into()),
            ..Vault::default()
        }
    }

    #[test]
    fn connects_gitlab_with_the_git_sign_in() {
        let (hosting, vault, _) = setup(true, signed_in_vault(), FakeGitLab::default());

        let access = hosting.connect_with_login(SERVER).unwrap();

        assert_eq!(access.kind, HostingKind::GitLab);
        assert_eq!(vault.token.lock().unwrap().as_deref(), Some("oauth-1"));
        assert_eq!(hosting.connections().unwrap(), [access]);
        assert!(hosting.pull_requests(Path::new(REPOSITORY)).is_ok());
    }

    #[test]
    fn renews_an_expired_token_from_the_sign_in() {
        let (hosting, vault, gitlab) = setup(true, signed_in_vault(), FakeGitLab::default());
        hosting.connect_with_login(SERVER).unwrap();
        // The server moved on to a newer token, so the stored one is refused.
        *gitlab.grants.lock().unwrap() += 1;

        assert!(hosting.pull_requests(Path::new(REPOSITORY)).is_ok());
        assert_eq!(vault.token.lock().unwrap().as_deref(), Some("oauth-3"));
    }

    #[test]
    fn asks_to_sign_in_first_without_a_git_sign_in() {
        let (hosting, _, _) = setup(false, signed_in_vault(), FakeGitLab::default());
        assert!(matches!(
            hosting.connect_with_login(SERVER),
            Err(RepositoryError::AuthenticationFailed { .. })
        ));

        let (hosting, _, _) = setup(true, Vault::default(), FakeGitLab::default());
        assert!(matches!(
            hosting.connect_with_login(SERVER),
            Err(RepositoryError::AuthenticationFailed { .. })
        ));
    }

    #[test]
    fn falls_back_to_a_token_when_the_server_refuses_passwords() {
        let gitlab = FakeGitLab {
            password_grant_off: true,
            ..FakeGitLab::default()
        };
        let (hosting, _, _) = setup(true, signed_in_vault(), gitlab);

        assert!(matches!(
            hosting.connect_with_login(SERVER),
            Err(RepositoryError::HostingLoginUnsupported { .. })
        ));
        assert_eq!(hosting.connections().unwrap(), []);
    }
}

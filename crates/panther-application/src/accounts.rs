//! Use cases: sign in to HTTPS git servers and sign out again.

use std::path::Path;
use std::sync::Arc;

use panther_domain::account::{Account, Password, Server, parse_username};
use panther_domain::ports::{CredentialStore, RemoteSync, SettingsStore};
use panther_domain::repository::RepositoryError;

/// What the user typed to sign in.
pub struct SignIn<'a> {
    /// A server address or any HTTPS repository URL on it.
    pub server: &'a str,
    pub username: &'a str,
    pub password: String,
    /// When given, the credentials are tried against this repository's
    /// remote on the same server before they are kept.
    pub repository: Option<&'a Path>,
}

pub struct Accounts {
    credentials: Arc<dyn CredentialStore>,
    settings: Arc<dyn SettingsStore>,
    remotes: Arc<dyn RemoteSync>,
}

impl Accounts {
    pub fn new(
        credentials: Arc<dyn CredentialStore>,
        settings: Arc<dyn SettingsStore>,
        remotes: Arc<dyn RemoteSync>,
    ) -> Self {
        Self {
            credentials,
            settings,
            remotes,
        }
    }

    /// # Errors
    /// Propagates [`SettingsStore::load`] errors.
    pub fn list(&self) -> Result<Vec<Account>, RepositoryError> {
        Ok(self.settings.load()?.accounts)
    }

    /// Hands the credentials to git's credential helper and remembers the
    /// account. Wrong credentials are erased again, never kept.
    ///
    /// # Errors
    /// Invalid input, [`RepositoryError::CredentialHelperMissing`],
    /// [`RepositoryError::AuthenticationFailed`] or a storage error.
    pub fn sign_in(&self, request: SignIn<'_>) -> Result<Account, RepositoryError> {
        let account = Account {
            server: Server::parse(request.server)?,
            username: parse_username(request.username)?,
        };
        let password = Password::new(request.password)?;
        if !self.credentials.has_helper()? {
            return Err(RepositoryError::CredentialHelperMissing);
        }
        let verify_url = match request.repository {
            Some(repository) => self.remote_on(repository, &account.server)?,
            None => None,
        };
        self.credentials.store(&account, &password)?;
        if let Some(url) = verify_url
            && let Err(error) = self.credentials.verify(&url)
        {
            if matches!(error, RepositoryError::AuthenticationFailed { .. }) {
                self.credentials.erase(&account)?;
            }
            return Err(error);
        }
        let mut settings = self.settings.load()?;
        settings.accounts.retain(|existing| existing != &account);
        settings.accounts.push(account.clone());
        self.settings.save(&settings)?;
        Ok(account)
    }

    /// Forgets the password and the account.
    ///
    /// # Errors
    /// Invalid input, or a credential helper or storage error.
    pub fn sign_out(&self, server: &str, username: &str) -> Result<(), RepositoryError> {
        let account = Account {
            server: Server::parse(server)?,
            username: parse_username(username)?,
        };
        self.credentials.erase(&account)?;
        let mut settings = self.settings.load()?;
        settings.accounts.retain(|existing| existing != &account);
        self.settings.save(&settings)
    }

    /// The URL of a remote of `repository` that lives on `server`.
    fn remote_on(
        &self,
        repository: &Path,
        server: &Server,
    ) -> Result<Option<String>, RepositoryError> {
        Ok(self
            .remotes
            .remotes(repository)?
            .into_iter()
            .map(|remote| remote.url)
            .find(|url| Server::parse(url).is_ok_and(|candidate| &candidate == server)))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use panther_domain::remote::{PullStrategy, Remote};
    use panther_domain::repository::{CancellationToken, CloneProgress};
    use panther_domain::settings::Settings;

    use super::*;

    const SERVER: &str = "https://gitlab.example.internal";
    const GOOD_PASSWORD: &str = "right";

    #[derive(Default)]
    struct FakeHelper {
        stored: Mutex<Vec<(String, String)>>,
        missing: bool,
    }

    impl CredentialStore for FakeHelper {
        fn has_helper(&self) -> Result<bool, RepositoryError> {
            Ok(!self.missing)
        }

        fn store(&self, account: &Account, password: &Password) -> Result<(), RepositoryError> {
            self.stored
                .lock()
                .unwrap()
                .push((account.username.clone(), password.expose().to_owned()));
            Ok(())
        }

        fn erase(&self, account: &Account) -> Result<(), RepositoryError> {
            self.stored
                .lock()
                .unwrap()
                .retain(|(username, _)| username != &account.username);
            Ok(())
        }

        fn verify(&self, _url: &str) -> Result<(), RepositoryError> {
            let stored = self.stored.lock().unwrap();
            if stored.iter().any(|(_, password)| password == GOOD_PASSWORD) {
                Ok(())
            } else {
                Err(RepositoryError::AuthenticationFailed {
                    details: "HTTP 401".into(),
                })
            }
        }
    }

    #[derive(Default)]
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

    /// One `origin` on the GitLab server.
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
            unreachable!("signing in never fetches")
        }

        fn pull(
            &self,
            _: &Path,
            _: PullStrategy,
            _: &mut dyn FnMut(CloneProgress),
            _: &CancellationToken,
        ) -> Result<(), RepositoryError> {
            unreachable!("signing in never pulls")
        }

        fn push(
            &self,
            _: &Path,
            _: &mut dyn FnMut(CloneProgress),
            _: &CancellationToken,
        ) -> Result<(), RepositoryError> {
            unreachable!("signing in never pushes")
        }
    }

    fn accounts(helper: FakeHelper) -> (Accounts, Arc<FakeHelper>) {
        let helper = Arc::new(helper);
        let accounts = Accounts::new(
            helper.clone(),
            Arc::new(MemorySettings::default()),
            Arc::new(OriginOnServer),
        );
        (accounts, helper)
    }

    fn sign_in(accounts: &Accounts, password: &str) -> Result<Account, RepositoryError> {
        accounts.sign_in(SignIn {
            server: SERVER,
            username: "p9493378",
            password: password.into(),
            repository: Some(Path::new("repo")),
        })
    }

    #[test]
    fn keeps_verified_credentials_and_remembers_the_account() {
        let (accounts, helper) = accounts(FakeHelper::default());

        sign_in(&accounts, GOOD_PASSWORD).unwrap();

        assert_eq!(helper.stored.lock().unwrap().len(), 1);
        let listed = accounts.list().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].username, "p9493378");
    }

    #[test]
    fn erases_wrong_credentials_instead_of_keeping_them() {
        let (accounts, helper) = accounts(FakeHelper::default());

        let result = sign_in(&accounts, "wrong");

        assert!(matches!(
            result,
            Err(RepositoryError::AuthenticationFailed { .. })
        ));
        assert_eq!(helper.stored.lock().unwrap().len(), 0);
        assert_eq!(accounts.list().unwrap().len(), 0);
    }

    #[test]
    fn explains_a_missing_credential_helper() {
        let (accounts, _) = accounts(FakeHelper {
            missing: true,
            ..FakeHelper::default()
        });
        assert!(matches!(
            sign_in(&accounts, GOOD_PASSWORD),
            Err(RepositoryError::CredentialHelperMissing)
        ));
    }

    #[test]
    fn signing_out_forgets_password_and_account() {
        let (accounts, helper) = accounts(FakeHelper::default());
        sign_in(&accounts, GOOD_PASSWORD).unwrap();

        accounts.sign_out(SERVER, "p9493378").unwrap();

        assert_eq!(helper.stored.lock().unwrap().len(), 0);
        assert_eq!(accounts.list().unwrap().len(), 0);
    }
}

//! Who commits in a repository, and whether their commits are signed.

/// How commits are signed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SigningFormat {
    /// `GnuPG` (`gpg.format = openpgp`).
    OpenPgp,
    /// An SSH key (`gpg.format = ssh`).
    Ssh,
    /// S/MIME certificates (`gpg.format = x509`).
    X509,
}

impl SigningFormat {
    /// The value of git's `gpg.format`.
    pub fn as_config(self) -> &'static str {
        match self {
            Self::OpenPgp => "openpgp",
            Self::Ssh => "ssh",
            Self::X509 => "x509",
        }
    }

    pub fn from_config(value: &str) -> Self {
        match value.trim() {
            "ssh" => Self::Ssh,
            "x509" => Self::X509,
            _ => Self::OpenPgp,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signing {
    pub format: SigningFormat,
    /// A key id, or the path of an SSH public key.
    pub key: String,
}

/// The author written into new commits.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    pub name: String,
    pub email: String,
    /// `None` commits unsigned.
    pub signing: Option<Signing>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum InvalidIdentity {
    #[error("Enter the name to commit as.")]
    MissingName,
    #[error("\"{0}\" is not an email address.")]
    InvalidEmail(String),
    #[error("Enter the signing key, or turn signing off.")]
    MissingSigningKey,
}

impl Identity {
    /// # Errors
    /// [`InvalidIdentity`] naming the first problem.
    pub fn validate(&self) -> Result<(), InvalidIdentity> {
        if self.name.trim().is_empty() {
            return Err(InvalidIdentity::MissingName);
        }
        let email = self.email.trim();
        let well_formed = email
            .split_once('@')
            .is_some_and(|(user, host)| !user.is_empty() && !host.is_empty())
            && !email.contains(char::is_whitespace);
        if !well_formed {
            return Err(InvalidIdentity::InvalidEmail(email.to_owned()));
        }
        if self
            .signing
            .as_ref()
            .is_some_and(|signing| signing.key.trim().is_empty())
        {
            return Err(InvalidIdentity::MissingSigningKey);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity(name: &str, email: &str) -> Identity {
        Identity {
            name: name.into(),
            email: email.into(),
            signing: None,
        }
    }

    #[test]
    fn validates_names_emails_and_keys() {
        assert!(identity("Dana", "dana@example.internal").validate().is_ok());
        assert_eq!(
            identity(" ", "dana@example.internal").validate(),
            Err(InvalidIdentity::MissingName)
        );
        for bad in ["dana", "@example", "dana@", "da na@example.internal"] {
            assert!(identity("Dana", bad).validate().is_err(), "{bad}");
        }
        let unsigned_key = Identity {
            signing: Some(Signing {
                format: SigningFormat::Ssh,
                key: String::new(),
            }),
            ..identity("Dana", "dana@example.internal")
        };
        assert_eq!(
            unsigned_key.validate(),
            Err(InvalidIdentity::MissingSigningKey)
        );
    }
}

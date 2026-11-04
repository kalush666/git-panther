//! Git Panther domain model.
//!
//! This crate is the innermost layer: it defines the vocabulary of the
//! application and the ports (traits) that outer layers implement. It must
//! never depend on git engines, UI frameworks or async runtimes.

pub mod account;
pub mod bisect;
pub mod branch;
pub mod commit;
pub mod conflict;
pub mod git_installation;
pub mod gitflow;
pub mod history;
pub mod hosting;
pub mod identity;
pub mod layout;
pub mod ports;
pub mod recent;
pub mod remote;
pub mod repository;
pub mod settings;
pub mod stash;
pub mod working_tree;

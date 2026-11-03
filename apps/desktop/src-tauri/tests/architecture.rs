//! Architecture test: enforces that dependencies only point inward.
//!
//! Cargo already prevents undeclared dependencies; this test prevents someone
//! from *declaring* one that breaks the hexagonal layering.

use std::collections::{BTreeSet, HashMap};

use cargo_metadata::{DependencyKind, MetadataCommand, NodeDep, Package, PackageId};

/// Workspace crates each inner-layer crate may depend on (directly or transitively).
const LAYER_RULES: &[(&str, &[&str])] = &[
    ("panther-domain", &[]),
    ("panther-graph", &["panther-domain"]),
    ("panther-application", &["panther-domain", "panther-graph"]),
    ("panther-git", &["panther-domain"]),
];

/// External crates that must never leak into the domain or application layers.
const FORBIDDEN_IN_CORE: &[&str] = &["git2", "tauri", "tokio", "serde", "specta"];
const CORE_CRATES: &[&str] = &["panther-domain", "panther-graph", "panther-application"];

#[test]
fn inner_layers_only_depend_inward() {
    let metadata = MetadataCommand::new()
        .no_deps()
        .exec()
        .expect("cargo metadata should run");
    let workspace: HashMap<&str, &Package> = metadata
        .workspace_packages()
        .into_iter()
        .map(|package| (package.name.as_str(), package))
        .collect();

    for (crate_name, allowed) in LAYER_RULES {
        let package = workspace[crate_name];
        for dependency in &package.dependencies {
            let is_workspace_crate = workspace.contains_key(dependency.name.as_str());
            assert!(
                !is_workspace_crate || allowed.contains(&dependency.name.as_str()),
                "{crate_name} must not depend on {} (allowed: {allowed:?})",
                dependency.name
            );
        }
    }
}

#[test]
fn core_layers_are_free_of_frameworks() {
    let metadata = MetadataCommand::new()
        .exec()
        .expect("cargo metadata should run");
    let resolve = metadata
        .resolve
        .as_ref()
        .expect("dependency graph resolved");
    let nodes: HashMap<&PackageId, Vec<&PackageId>> = resolve
        .nodes
        .iter()
        .map(|node| {
            let shipped = node.deps.iter().filter(|dep| is_shipped(dep));
            (&node.id, shipped.map(|dep| &dep.pkg).collect())
        })
        .collect();
    let names: HashMap<&PackageId, &str> = metadata
        .packages
        .iter()
        .map(|package| (&package.id, package.name.as_str()))
        .collect();

    for crate_name in CORE_CRATES {
        let root = metadata
            .workspace_packages()
            .into_iter()
            .find(|package| package.name.as_str() == *crate_name)
            .expect("core crate is a workspace member");
        let reachable = transitive_dependency_names(&root.id, &nodes, &names);
        for forbidden in FORBIDDEN_IN_CORE {
            assert!(
                !reachable.contains(forbidden),
                "{crate_name} must not (transitively) depend on {forbidden}"
            );
        }
    }
}

/// Only normal dependencies end up in the built crate; dev-dependencies such
/// as benchmark harnesses never ship.
fn is_shipped(dependency: &NodeDep) -> bool {
    dependency
        .dep_kinds
        .iter()
        .any(|info| info.kind == DependencyKind::Normal)
}

fn transitive_dependency_names<'a>(
    root: &'a PackageId,
    nodes: &HashMap<&'a PackageId, Vec<&'a PackageId>>,
    names: &HashMap<&'a PackageId, &'a str>,
) -> BTreeSet<&'a str> {
    let mut seen = BTreeSet::new();
    let mut stack = vec![root];
    let mut found = BTreeSet::new();
    while let Some(id) = stack.pop() {
        if !seen.insert(id) {
            continue;
        }
        for dependency in nodes.get(id).into_iter().flatten() {
            found.insert(names[dependency]);
            stack.push(dependency);
        }
    }
    found
}

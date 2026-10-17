//! Reads repo info straight from the .git directory, with no git process.

use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::modules::git::types::{GitRepoInfo, MAX_FILE_BYTES};
use crate::modules::git::utils::{display_path, ResolvedGitDirectory};
use crate::modules::workspace::WorkspaceRegistry;

/// Branch, upstream and worktree flag for a local repository, read from the
/// filesystem alone: walking up to `.git`, then HEAD, commondir and the
/// config. Returns `None` whenever the layout is not one of the plain cases
/// (a WSL workspace, a `GIT_*` override, an unparsable HEAD, a config the
/// strict reader does not fully understand); the caller then answers through
/// the git process exactly as before, so authorization semantics never widen.
pub fn resolve_repo_direct(
    registry: &WorkspaceRegistry,
    cwd: &ResolvedGitDirectory,
) -> Option<GitRepoInfo> {
    if cwd.workspace.is_wsl() || git_env_overrides() {
        return None;
    }
    let repo = discover(&cwd.local_path)?;
    if repo.common_dir.join("reftable").is_dir() {
        // The refs live in a binary table the reader here cannot consult.
        return None;
    }
    let head = read_head(&repo.git_dir)?;
    let (branch, is_detached) = match &head {
        Head::Branch(name) => (name.clone(), false),
        Head::Detached => ("HEAD".to_string(), true),
    };
    let upstream = if is_detached {
        None
    } else {
        match upstream_from_config(&repo, &branch)? {
            Upstream::Unset => None,
            Upstream::Configured(name) => Some(name),
        }
    };
    if repo.root == cwd.local_path {
        // Same rule as resolve_repo_root: authorize the root itself, never a
        // root strictly above the cwd the caller asked about.
        let _ = registry.authorize(&repo.root);
    }
    Some(GitRepoInfo {
        repo_root: display_path(&repo.root),
        branch,
        upstream,
        is_detached,
        is_worktree: repo.is_worktree,
    })
}

struct DiscoveredRepo {
    /// The worktree root: the directory that holds `.git`.
    root: PathBuf,
    /// The git dir: `<root>/.git`, or the dir a `.git` file points at.
    git_dir: PathBuf,
    /// Where shared config and refs live: the git dir, or the main `.git` a
    /// linked worktree's commondir names.
    common_dir: PathBuf,
    is_worktree: bool,
}

/// Walks up from `cwd` the way git's discovery does: the first `.git` (a
/// directory, or a file whose `gitdir:` line points at one) marks the repo
/// root; a parent on another filesystem, a path named `.git` and any stat
/// error all give up. `cwd` must already be canonical.
fn discover(cwd: &Path) -> Option<DiscoveredRepo> {
    let mut dir = cwd.to_path_buf();
    #[cfg(unix)]
    let mut dev = device_of(&dir)?;
    loop {
        if dir.file_name() == Some(std::ffi::OsStr::new(".git")) {
            // Inside a git dir there is no worktree; git refuses to answer
            // here too, but let it say so through the fallback.
            return None;
        }
        let dot = dir.join(".git");
        match std::fs::metadata(&dot) {
            Ok(meta) if meta.is_dir() => {
                return discovered(dir, dot);
            }
            Ok(meta) if meta.is_file() => {
                let target = PathBuf::from(parse_gitdir(&dot)?);
                let git_dir = if target.is_absolute() {
                    target
                } else {
                    dir.join(target)
                };
                return discovered(dir, git_dir);
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return None,
        }
        let parent = dir.parent()?;
        #[cfg(unix)]
        {
            // Discovery stops at filesystem boundaries
            // (GIT_DISCOVERY_ACROSS_FILESYSTEM unset, which is gated above).
            let parent_dev = device_of(parent)?;
            if parent_dev != dev {
                return None;
            }
            dev = parent_dev;
        }
        dir = parent.to_path_buf();
    }
}

fn discovered(root: PathBuf, git_dir: PathBuf) -> Option<DiscoveredRepo> {
    let common_dir = match read_small(&git_dir.join("commondir")) {
        Some(text) => {
            let raw = text.trim().lines().next()?;
            let path = PathBuf::from(raw);
            let path = if path.is_absolute() {
                path
            } else {
                git_dir.join(path)
            };
            std::fs::canonicalize(&path).ok()?
        }
        None => git_dir.clone(),
    };
    let git_dir = std::fs::canonicalize(&git_dir).ok()?;
    Some(DiscoveredRepo {
        root,
        is_worktree: common_dir != git_dir,
        git_dir,
        common_dir,
    })
}

fn parse_gitdir(dot: &Path) -> Option<String> {
    let text = read_small(dot)?;
    let line = text.trim().lines().next()?;
    let target = line.strip_prefix("gitdir:")?.trim();
    (!target.is_empty()).then(|| target.to_string())
}

enum Head {
    Branch(String),
    Detached,
}

fn read_head(git_dir: &Path) -> Option<Head> {
    let text = read_small(&git_dir.join("HEAD"))?;
    let line = text.trim().lines().next()?;
    if let Some(refname) = line.strip_prefix("ref:") {
        let refname = refname.trim();
        let branch = refname
            .strip_prefix("refs/heads/")
            .filter(|name| !name.is_empty())?;
        return Some(Head::Branch(branch.to_string()));
    }
    if line.len() == 40 && line.chars().all(|c| c.is_ascii_hexdigit()) {
        return Some(Head::Detached);
    }
    None
}

enum Upstream {
    /// The branch config or the tracking ref is missing: `@{u}` would fail.
    Unset,
    /// The abbreviated upstream name git would print.
    Configured(String),
}

/// The upstream of `branch` from the common config. `None` means the config is
/// not one of the plain forms (include sections, extensions, escapes, a fetch
/// refspec that does not map `refs/heads/*` plainly...): the caller falls back
/// to the git process, which resolves every one of them.
fn upstream_from_config(repo: &DiscoveredRepo, branch: &str) -> Option<Upstream> {
    let config = read_small(&repo.common_dir.join("config"))?;
    let mut section: Option<(String, Option<String>)> = None;
    let mut branch_remote: Option<String> = None;
    let mut branch_merge: Option<String> = None;
    let mut remote_urls: HashMap<String, usize> = HashMap::new();
    let mut remote_fetches: HashMap<String, Vec<String>> = HashMap::new();
    for raw in config.lines() {
        let line = raw.trim_end_matches('\r').trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if line.ends_with('\\') {
            return None; // a continued value: let git parse it
        }
        if let Some(inner) = line.strip_prefix('[').and_then(|l| l.strip_suffix(']')) {
            let (name, sub) = parse_section_header(inner)?;
            match name.as_str() {
                "include" | "includeif" | "extensions" => return None,
                _ => {}
            }
            section = Some((name, sub));
            continue;
        }
        let (key_raw, value_raw) = line.split_once('=')?;
        let key = key_raw.trim();
        if key.is_empty()
            || key.contains('"')
            || key.contains(' ')
            || key.contains('\t')
            || key.contains('.')
        {
            return None;
        }
        let value = parse_value(value_raw.trim())?;
        let Some((name, sub)) = &section else {
            continue;
        };
        match (name.as_str(), sub) {
            ("branch", Some(sub)) if sub == branch => match key.to_ascii_lowercase().as_str() {
                "remote" => {
                    if branch_remote.is_some() {
                        return None;
                    }
                    branch_remote = Some(value);
                }
                "merge" => {
                    if branch_merge.is_some() {
                        return None;
                    }
                    branch_merge = Some(value);
                }
                _ => {}
            },
            ("remote", Some(sub)) => match key.to_ascii_lowercase().as_str() {
                "url" => *remote_urls.entry(sub.clone()).or_insert(0) += 1,
                "fetch" => remote_fetches.entry(sub.clone()).or_default().push(value),
                _ => {}
            },
            _ => {}
        }
    }
    let Some(merge) = branch_merge else {
        return Some(Upstream::Unset);
    };
    let short = merge
        .strip_prefix("refs/heads/")
        .filter(|s| !s.is_empty())?;
    let Some(remote) = branch_remote else {
        return Some(Upstream::Unset);
    };
    if remote == "." {
        return if ref_exists(repo, &format!("refs/heads/{short}")) {
            Some(Upstream::Configured(short.to_string()))
        } else {
            Some(Upstream::Unset)
        };
    }
    let (Some(&url_count), Some(fetches)) = (
        remote_urls.get(remote.as_str()),
        remote_fetches.get(remote.as_str()),
    ) else {
        // No section for this name: git may still match by URL.
        return None;
    };
    if url_count == 0 || fetches.len() != 1 {
        return None;
    }
    let fetch = fetches[0].as_str();
    if fetch != format!("+refs/heads/*:refs/remotes/{remote}/*")
        && fetch != format!("refs/heads/*:refs/remotes/{remote}/*")
    {
        return None;
    }
    let tracking = format!("refs/remotes/{remote}/{short}");
    if ref_exists(repo, &tracking) {
        Some(Upstream::Configured(format!("{remote}/{short}")))
    } else {
        Some(Upstream::Unset)
    }
}

fn parse_section_header(inner: &str) -> Option<(String, Option<String>)> {
    let inner = inner.trim();
    let (name, sub) = match inner.split_once('"') {
        Some((name, rest)) => (name.trim(), Some(rest.strip_suffix('"')?)),
        None => (inner, None),
    };
    let sub = sub.map(str::to_string);
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.'))
        || sub
            .as_deref()
            .is_some_and(|s| s.is_empty() || s.contains('\\') || s.contains('"'))
    {
        return None;
    }
    Some((name.to_ascii_lowercase(), sub))
}

fn parse_value(value: &str) -> Option<String> {
    let value = if value.starts_with('"') {
        if !value.ends_with('"') || value.len() < 2 {
            return None;
        }
        &value[1..value.len() - 1]
    } else {
        let cut = value.find(['#', ';']).unwrap_or(value.len());
        value[..cut].trim()
    };
    if value.contains('"') || value.contains('\\') {
        return None; // escapes: let git parse it
    }
    Some(value.to_string())
}

/// Whether `refname` exists as a loose ref under the common dir or as an entry
/// in packed-refs, the same two places git looks.
fn ref_exists(repo: &DiscoveredRepo, refname: &str) -> bool {
    let mut path = repo.common_dir.clone();
    for part in refname.split('/') {
        path.push(part);
    }
    if path.exists() {
        return true;
    }
    let Some(packed) = read_small(&repo.common_dir.join("packed-refs")) else {
        return false;
    };
    packed.lines().any(|line| {
        !line.starts_with('#')
            && line
                .split_once(' ')
                .is_some_and(|(_, name)| name.trim() == refname)
    })
}

/// Reads a small repo file (HEAD, config, commondir, packed-refs). Any error
/// gives up; the size bound holds even through a symlink.
fn read_small(path: &Path) -> Option<String> {
    const MAX: usize = MAX_FILE_BYTES as usize;
    let file = File::open(path).ok()?;
    let mut bytes = Vec::new();
    file.take(MAX as u64 + 1).read_to_end(&mut bytes).ok()?;
    if bytes.len() > MAX {
        return None;
    }
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

/// Environment that would redirect git's own discovery or config reads; the
/// direct read is only valid when none of it is set.
fn git_env_overrides() -> bool {
    [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_COMMON_DIR",
        "GIT_NAMESPACE",
        "GIT_SUPER_PREFIX",
        "GIT_CEILING_DIRECTORIES",
        "GIT_DISCOVERY_ACROSS_FILESYSTEM",
        "GIT_CONFIG",
        "GIT_CONFIG_COUNT",
        "GIT_CONFIG_PARAMETERS",
        "GIT_CONFIG_GLOBAL",
        "GIT_CONFIG_SYSTEM",
    ]
    .iter()
    .any(|key| std::env::var_os(key).is_some())
}

#[cfg(unix)]
fn device_of(path: &Path) -> Option<u64> {
    use std::os::unix::fs::MetadataExt;
    std::fs::metadata(path).ok().map(|meta| meta.dev())
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::process::Command as Cmd;

    use super::resolve_repo_direct;
    use crate::modules::git::types::GitRepoInfo;
    use crate::modules::git::utils::{display_path, ResolvedGitDirectory};
    use crate::modules::workspace::{WorkspaceEnv, WorkspaceRegistry};

    fn git(dir: &Path, args: &[&str]) {
        let out = Cmd::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "git {args:?} in {} failed: {}",
            dir.display(),
            String::from_utf8_lossy(&out.stderr)
        );
    }

    fn git_line(dir: &Path, args: &[&str]) -> Option<String> {
        let out = Cmd::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .unwrap();
        if !out.status.success() {
            return None;
        }
        let line = String::from_utf8_lossy(&out.stdout)
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .to_string();
        (!line.is_empty()).then_some(line)
    }

    /// The git process answer: the exact commands `resolve_repo` used to run.
    fn git_answer(dir: &Path) -> Option<GitRepoInfo> {
        let root = git_line(dir, &["rev-parse", "--show-toplevel"])?;
        let root = std::fs::canonicalize(&root).ok()?;
        let branch = git_line(dir, &["rev-parse", "--abbrev-ref", "HEAD"])
            .or_else(|| git_line(dir, &["symbolic-ref", "--short", "HEAD"]))?;
        let upstream = git_line(
            dir,
            &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        );
        let is_worktree = match (
            git_line(dir, &["rev-parse", "--git-dir"]),
            git_line(dir, &["rev-parse", "--git-common-dir"]),
        ) {
            (Some(a), Some(b)) => a != b,
            _ => false,
        };
        Some(GitRepoInfo {
            repo_root: display_path(&root),
            is_detached: branch == "HEAD",
            branch,
            upstream,
            is_worktree,
        })
    }

    /// The directory as `resolve_repo` would hand it over: canonical.
    fn resolved_local(dir: &Path) -> ResolvedGitDirectory {
        let local = std::fs::canonicalize(dir).unwrap();
        ResolvedGitDirectory {
            workspace: WorkspaceEnv::Local,
            git_path: display_path(&local),
            local_path: local,
        }
    }

    fn init_repo(dir: &Path) {
        git(dir, &["init", "-q"]);
        git(dir, &["config", "user.email", "t@t.com"]);
        git(dir, &["config", "user.name", "T"]);
        std::fs::write(dir.join("a.txt"), b"hello").unwrap();
        git(dir, &["add", "a.txt"]);
        git(dir, &["commit", "-q", "-m", "init"]);
    }

    fn current_branch(dir: &Path) -> String {
        git_line(dir, &["rev-parse", "--abbrev-ref", "HEAD"])
            .or_else(|| git_line(dir, &["symbolic-ref", "--short", "HEAD"]))
            .unwrap()
    }

    /// Wires the branch up to a remote-tracking ref, the state `git clone` and
    /// `git remote add` leave behind: branch.<b>.remote/merge plus the default
    /// fetch refspec and the tracking ref itself.
    fn configure_upstream(dir: &Path) {
        let branch = current_branch(dir);
        let branch_remote = format!("branch.{branch}.remote");
        let branch_merge = format!("branch.{branch}.merge");
        let merge_ref = format!("refs/heads/{branch}");
        let fetch_refspec = "+refs/heads/*:refs/remotes/origin/*";
        git(dir, &["config", branch_remote.as_str(), "origin"]);
        git(dir, &["config", branch_merge.as_str(), merge_ref.as_str()]);
        git(
            dir,
            &["config", "remote.origin.url", "https://example.com/x.git"],
        );
        git(dir, &["config", "remote.origin.fetch", fetch_refspec]);
        let sha = git_line(dir, &["rev-parse", merge_ref.as_str()]).unwrap();
        let tracking = dir.join(".git/refs/remotes/origin");
        std::fs::create_dir_all(&tracking).unwrap();
        std::fs::write(tracking.join(&branch), format!("{sha}\n")).unwrap();
    }

    #[test]
    fn matches_git_process_for_plain_repo() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        configure_upstream(dir.path());

        let registry = WorkspaceRegistry::default();
        let info =
            resolve_repo_direct(&registry, &resolved_local(dir.path())).expect("direct answer");
        assert_eq!(info, git_answer(dir.path()).unwrap());
    }

    #[test]
    fn matches_git_process_without_upstream() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());

        let registry = WorkspaceRegistry::default();
        let info =
            resolve_repo_direct(&registry, &resolved_local(dir.path())).expect("direct answer");
        assert_eq!(info, git_answer(dir.path()).unwrap());
    }

    #[test]
    fn matches_git_process_for_packed_refs() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        configure_upstream(dir.path());
        git(dir.path(), &["pack-refs", "--all"]);

        let registry = WorkspaceRegistry::default();
        let info =
            resolve_repo_direct(&registry, &resolved_local(dir.path())).expect("direct answer");
        assert_eq!(info, git_answer(dir.path()).unwrap());
    }

    #[test]
    fn matches_git_process_for_unborn_branch() {
        let dir = tempfile::tempdir().unwrap();
        git(dir.path(), &["init", "-q"]);

        let registry = WorkspaceRegistry::default();
        let info =
            resolve_repo_direct(&registry, &resolved_local(dir.path())).expect("direct answer");
        assert_eq!(info, git_answer(dir.path()).unwrap());
    }

    #[test]
    fn matches_git_process_for_detached_head() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        git(dir.path(), &["checkout", "-q", "--detach"]);

        let registry = WorkspaceRegistry::default();
        let info =
            resolve_repo_direct(&registry, &resolved_local(dir.path())).expect("direct answer");
        assert_eq!(info, git_answer(dir.path()).unwrap());
    }

    #[test]
    fn matches_git_process_for_linked_worktree() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let wt = dir.path().join("wt");
        let wt_arg = wt.to_string_lossy().into_owned();
        git(
            dir.path(),
            &["worktree", "add", "-q", "-b", "feature", wt_arg.as_str()],
        );

        let registry = WorkspaceRegistry::default();
        let info = resolve_repo_direct(&registry, &resolved_local(&wt)).expect("direct answer");
        assert_eq!(info, git_answer(&wt).unwrap());
    }

    #[test]
    fn matches_git_process_outside_any_repo() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("x.txt"), b"y").unwrap();

        let registry = WorkspaceRegistry::default();
        assert_eq!(
            resolve_repo_direct(&registry, &resolved_local(dir.path())),
            None
        );
        assert_eq!(git_answer(dir.path()), None);
    }

    #[test]
    fn matches_git_process_from_inside_git_dir() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let inside = dir.path().join(".git").join("hooks");

        let registry = WorkspaceRegistry::default();
        assert_eq!(
            resolve_repo_direct(&registry, &resolved_local(&inside)),
            None
        );
        assert_eq!(git_answer(&inside), None);
    }

    #[test]
    fn matches_git_process_for_local_dot_upstream() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let branch = current_branch(dir.path());
        let branch_remote = format!("branch.{branch}.remote");
        let branch_merge = format!("branch.{branch}.merge");
        let merge_ref = format!("refs/heads/{branch}");
        git(dir.path(), &["config", branch_remote.as_str(), "."]);
        git(
            dir.path(),
            &["config", branch_merge.as_str(), merge_ref.as_str()],
        );

        let registry = WorkspaceRegistry::default();
        let info =
            resolve_repo_direct(&registry, &resolved_local(dir.path())).expect("direct answer");
        assert_eq!(info, git_answer(dir.path()).unwrap());
    }

    #[test]
    fn wsl_workspaces_are_left_to_the_git_process() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());

        let registry = WorkspaceRegistry::default();
        let wsl_cwd = ResolvedGitDirectory {
            workspace: WorkspaceEnv::Wsl {
                distro: "Ubuntu".into(),
            },
            git_path: dir.path().to_string_lossy().into_owned(),
            local_path: dir.path().to_path_buf(),
        };
        assert_eq!(resolve_repo_direct(&registry, &wsl_cwd), None);
    }

    #[test]
    fn custom_fetch_refspec_falls_back_to_the_git_process() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let branch = current_branch(dir.path());
        let branch_remote = format!("branch.{branch}.remote");
        let branch_merge = format!("branch.{branch}.merge");
        let merge_ref = format!("refs/heads/{branch}");
        let fetch_refspec = format!("+refs/heads/{branch}:refs/remotes/up/{branch}");
        git(dir.path(), &["config", branch_remote.as_str(), "up"]);
        git(
            dir.path(),
            &["config", branch_merge.as_str(), merge_ref.as_str()],
        );
        git(
            dir.path(),
            &["config", "remote.up.url", "https://example.com/up.git"],
        );
        git(
            dir.path(),
            &["config", "remote.up.fetch", fetch_refspec.as_str()],
        );
        let sha = git_line(dir.path(), &["rev-parse", merge_ref.as_str()]).unwrap();
        let tracking = dir.path().join(".git/refs/remotes/up");
        std::fs::create_dir_all(&tracking).unwrap();
        std::fs::write(tracking.join(&branch), format!("{sha}\n")).unwrap();

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();
        let cwd = dir.path().to_string_lossy().into_owned();
        let info =
            crate::modules::git::operations::resolve_repo(&registry, &cwd, &WorkspaceEnv::Local)
                .unwrap()
                .expect("repo via the git process");
        assert_eq!(info, git_answer(dir.path()).unwrap());
    }
}

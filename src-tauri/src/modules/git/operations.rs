use std::ffi::{OsStr, OsString};
use std::path::Path;

use crate::modules::git::errors::{GitError, Result};
use crate::modules::git::parser::parse_porcelain_v2;
use crate::modules::git::process::{
    ensure_git_available, ensure_success, git_show_text, git_stdout_line_opt, git_stdout_lines,
    read_text_file, run_git,
};
use crate::modules::git::types::{
    DiscardEntry, GitBranchInfo, GitCommitFileChange, GitCommitResult, GitDiffContentResult,
    GitDiffResult, GitLogEntry, GitOutput, GitPanelSnapshot, GitPushResult, GitRemoteInfo,
    GitRepoInfo, GitStatusSnapshot, GitWorktreeInfo, GitWorktreeStatus, TextSource,
    DEFAULT_TIMEOUT_SECS, NETWORK_TIMEOUT_SECS,
};
use crate::modules::git::utils::{
    authorized_repo_root, canonical_dir, dir_path_for, resolve_within_repo, split_upstream,
    ResolvedGitDirectory,
};
use crate::modules::workspace::{WorkspaceEnv, WorkspaceRegistry};

pub fn resolve_repo(
    registry: &WorkspaceRegistry,
    cwd: &str,
    workspace: &WorkspaceEnv,
) -> Result<Option<GitRepoInfo>> {
    let cwd = canonical_dir(registry, &dir_path_for(cwd, workspace), workspace)?;
    if !registry.is_authorized(&cwd.local_path) {
        return Err(GitError::PathOutsideWorkspace(cwd.local_path));
    }
    ensure_git_available(&cwd.workspace)?;
    resolve_repo_in_authorized(registry, &cwd)
}

/// A linked worktree has a git dir under `<common>/worktrees/<name>`, so its
/// `--git-dir` differs from `--git-common-dir`; the main worktree reports the
/// same path for both. One git call, run at the repo root.
fn is_linked_worktree(root: &ResolvedGitDirectory) -> Result<bool> {
    let lines = git_stdout_lines(
        &root.workspace,
        &root.git_path,
        ["rev-parse", "--git-dir", "--git-common-dir"],
    )?;
    Ok(matches!((lines.first(), lines.get(1)), (Some(a), Some(b)) if a != b))
}

fn resolve_repo_in_authorized(
    registry: &WorkspaceRegistry,
    cwd: &ResolvedGitDirectory,
) -> Result<Option<GitRepoInfo>> {
    let Some(root_line) = git_stdout_line_opt(
        &cwd.workspace,
        &cwd.git_path,
        ["rev-parse", "--show-toplevel"],
    )?
    else {
        return Ok(None);
    };
    let canonical_root = canonical_dir(registry, &root_line, &cwd.workspace)?;
    // Guard: do not extend authorization to an ancestor of the already-authorized cwd.
    // A canonical_root strictly above cwd would silently escalate scope.
    let cwd_path = std::path::Path::new(&cwd.local_path);
    let root_path = std::path::Path::new(&canonical_root.local_path);
    if !(cwd_path.starts_with(root_path) && cwd_path != root_path) {
        let _ = registry.authorize(&canonical_root.local_path);
    }

    let head = match git_stdout_lines(
        &canonical_root.workspace,
        &canonical_root.git_path,
        ["rev-parse", "--abbrev-ref", "HEAD"],
    )?
    .into_iter()
    .next()
    {
        Some(h) => h,
        None => git_stdout_line_opt(
            &canonical_root.workspace,
            &canonical_root.git_path,
            ["symbolic-ref", "--short", "HEAD"],
        )?
        .ok_or(GitError::CommandFailed {
            context: "failed to resolve HEAD",
            detail: String::new(),
        })?,
    };

    let upstream = git_stdout_line_opt(
        &canonical_root.workspace,
        &canonical_root.git_path,
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )?;

    let is_worktree = is_linked_worktree(&canonical_root)?;

    Ok(Some(GitRepoInfo {
        repo_root: canonical_root.git_path,
        branch: head.clone(),
        upstream,
        is_detached: head == "HEAD",
        is_worktree,
    }))
}

pub fn panel_snapshot(
    registry: &WorkspaceRegistry,
    cwd: &str,
    workspace: &WorkspaceEnv,
) -> Result<GitPanelSnapshot> {
    let cwd = canonical_dir(registry, &dir_path_for(cwd, workspace), workspace)?;
    if !registry.is_authorized(&cwd.local_path) {
        return Err(GitError::PathOutsideWorkspace(cwd.local_path));
    }
    ensure_git_available(&cwd.workspace)?;
    let Some(root_line) = git_stdout_line_opt(
        &cwd.workspace,
        &cwd.git_path,
        ["rev-parse", "--show-toplevel"],
    )?
    else {
        return Ok(GitPanelSnapshot {
            repo: None,
            status: None,
        });
    };
    let canonical_root = canonical_dir(registry, &root_line, &cwd.workspace)?;
    // Guard: do not extend authorization to an ancestor of the already-authorized cwd.
    // A canonical_root strictly above cwd would silently escalate scope.
    let cwd_path = std::path::Path::new(&cwd.local_path);
    let root_path = std::path::Path::new(&canonical_root.local_path);
    if !(cwd_path.starts_with(root_path) && cwd_path != root_path) {
        let _ = registry.authorize(&canonical_root.local_path);
    }

    let status = status_inner(&canonical_root)?;
    let repo = GitRepoInfo {
        repo_root: canonical_root.git_path.clone(),
        branch: status.branch.clone(),
        upstream: status.upstream.clone(),
        is_detached: status.is_detached,
        is_worktree: is_linked_worktree(&canonical_root)?,
    };
    Ok(GitPanelSnapshot {
        repo: Some(repo),
        status: Some(status),
    })
}

pub fn status(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<GitStatusSnapshot> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    status_inner(&repo_root)
}

fn status_inner(repo_root: &ResolvedGitDirectory) -> Result<GitStatusSnapshot> {
    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        [
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            "--untracked-files=all",
        ],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git status failed")?;

    let stdout = std::str::from_utf8(&output.stdout).unwrap_or("");
    let parsed = parse_porcelain_v2(stdout);

    Ok(GitStatusSnapshot {
        repo_root: repo_root.git_path.clone(),
        branch: parsed.branch,
        upstream: parsed.upstream,
        ahead: parsed.ahead,
        behind: parsed.behind,
        is_detached: parsed.is_detached,
        truncated: output.truncated,
        changed_files: parsed.files,
    })
}

pub fn diff(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    path: Option<&str>,
    staged: bool,
    workspace: &WorkspaceEnv,
) -> Result<GitDiffResult> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    diff_inner(&repo_root, path, None, staged)
}

fn diff_inner(
    repo_root: &ResolvedGitDirectory,
    path: Option<&str>,
    original_path: Option<&str>,
    staged: bool,
) -> Result<GitDiffResult> {
    let mut args: Vec<OsString> = vec!["diff".into(), "--no-ext-diff".into()];
    if staged {
        args.push("--cached".into());
    }
    let pathspec = match path.filter(|p| !p.is_empty()) {
        Some(p) => Some(pathspec_from_input(&repo_root.local_path, p)?),
        None => None,
    };
    if let Some(spec) = pathspec.as_ref() {
        args.push("--".into());
        args.push(spec.clone().into());
        if let Some(orig) = original_path.filter(|o| !o.is_empty() && *o != spec.as_str()) {
            let orig_spec = pathspec_from_input(&repo_root.local_path, orig)?;
            args.push(orig_spec.into());
        }
    }
    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        args,
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git diff failed")?;

    let diff_text = match String::from_utf8(output.stdout) {
        Ok(text) => text,
        Err(e) => String::from_utf8_lossy(&e.into_bytes()).into_owned(),
    };
    Ok(GitDiffResult {
        diff_text,
        truncated: output.truncated,
    })
}

pub fn diff_content(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    path: &str,
    staged: bool,
    original_path: Option<&str>,
    workspace: &WorkspaceEnv,
) -> Result<GitDiffContentResult> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    let worktree_path = resolve_within_repo(&repo_root.local_path, path)?;
    let rel_path = pathspec(&repo_root.local_path, &worktree_path);

    let original_rel = match original_path {
        Some(orig) if !orig.is_empty() => {
            let resolved = resolve_within_repo(&repo_root.local_path, orig)?;
            Some(pathspec(&repo_root.local_path, &resolved))
        }
        _ => None,
    };

    let original = if staged {
        let spec = original_rel.as_deref().unwrap_or(&rel_path);
        git_show_text(
            &repo_root.workspace,
            &repo_root.git_path,
            &format!("HEAD:{spec}"),
        )?
    } else {
        git_show_text(
            &repo_root.workspace,
            &repo_root.git_path,
            &format!(":{rel_path}"),
        )?
    };
    let modified = if staged {
        git_show_text(
            &repo_root.workspace,
            &repo_root.git_path,
            &format!(":{rel_path}"),
        )?
    } else {
        read_text_file(&worktree_path)?
    };
    let patch = diff_inner(&repo_root, Some(&rel_path), original_rel.as_deref(), staged)?;
    let is_binary =
        matches!(original, TextSource::Binary) || matches!(modified, TextSource::Binary);

    Ok(GitDiffContentResult {
        original_content: original.into_text(),
        modified_content: modified.into_text(),
        is_binary,
        fallback_patch: patch.diff_text,
        truncated: patch.truncated,
    })
}

pub fn stage(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    paths: &[String],
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    if paths.is_empty() {
        return Ok(());
    }
    let resolved = resolve_pathspecs(&repo_root.local_path, paths)?;
    let mut args: Vec<OsString> = vec!["add".into(), "--".into()];
    for p in &resolved {
        args.push(p.clone().into());
    }
    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        args,
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git add failed")
}

pub fn unstage(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    paths: &[String],
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    if paths.is_empty() {
        return Ok(());
    }
    let resolved = resolve_pathspecs(&repo_root.local_path, paths)?;
    let mut reset_args: Vec<OsString> = vec!["reset".into(), "HEAD".into(), "--".into()];
    for p in &resolved {
        reset_args.push(p.clone().into());
    }
    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        reset_args,
        DEFAULT_TIMEOUT_SECS,
    )?;
    if output.exit_code == Some(0) {
        return Ok(());
    }
    if !looks_like_no_head(&output) {
        return ensure_success(&output, "git reset failed");
    }
    let mut rm_args: Vec<OsString> = vec![
        "rm".into(),
        "--cached".into(),
        "-r".into(),
        "--".into(),
    ];
    for p in &resolved {
        rm_args.push(p.clone().into());
    }
    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        rm_args,
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git rm --cached failed")
}

fn looks_like_no_head(output: &GitOutput) -> bool {
    let stderr = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
    stderr.contains("ambiguous argument 'head'")
        || stderr.contains("unknown revision")
        || stderr.contains("does not have any commits yet")
        || stderr.contains("bad revision 'head'")
}

pub fn discard(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    entries: &[DiscardEntry],
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    if entries.is_empty() {
        return Ok(());
    }

    let mut tracked: Vec<String> = Vec::with_capacity(entries.len());
    let mut untracked: Vec<String> = Vec::new();
    for entry in entries {
        let resolved = pathspec_from_input(&repo_root.local_path, &entry.path)?;
        if entry.untracked {
            untracked.push(resolved);
        } else {
            tracked.push(resolved);
        }
    }

    if !tracked.is_empty() {
        let mut args: Vec<OsString> = vec!["restore".into(), "--worktree".into(), "--".into()];
        for p in &tracked {
            args.push(p.clone().into());
        }
        let output = run_git(
            &repo_root.workspace,
            Some(&repo_root.git_path),
            args,
            DEFAULT_TIMEOUT_SECS,
        )?;
        ensure_success(&output, "git restore failed")?;
    }

    if !untracked.is_empty() {
        let mut args: Vec<OsString> = vec!["clean".into(), "-f".into(), "-d".into(), "--".into()];
        for p in &untracked {
            args.push(p.clone().into());
        }
        let output = run_git(
            &repo_root.workspace,
            Some(&repo_root.git_path),
            args,
            DEFAULT_TIMEOUT_SECS,
        )?;
        ensure_success(&output, "git clean failed")?;
    }

    Ok(())
}

pub fn commit(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    message: &str,
    workspace: &WorkspaceEnv,
) -> Result<GitCommitResult> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err(GitError::EmptyCommitMessage);
    }

    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        [OsStr::new("commit"), OsStr::new("-m"), OsStr::new(trimmed)],
        DEFAULT_TIMEOUT_SECS,
    )?;
    if output.exit_code != Some(0) && nothing_to_commit(&output) {
        return Err(GitError::command("git commit", "nothing staged"));
    }
    ensure_success(&output, "git commit failed")?;

    let combined = git_stdout_lines(
        &repo_root.workspace,
        &repo_root.git_path,
        ["show", "-s", "--format=%H%n%s", "HEAD"],
    )?;
    let sha = combined.first().cloned().ok_or(GitError::CommandFailed {
        context: "failed to resolve commit sha",
        detail: String::new(),
    })?;
    let summary = combined.get(1).cloned().unwrap_or_default();

    Ok(GitCommitResult {
        commit_sha: sha,
        summary,
    })
}

pub fn push(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<GitPushResult> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;

    let upstream = git_stdout_line_opt(
        &repo_root.workspace,
        &repo_root.git_path,
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )?;
    if upstream.is_none() {
        return Err(GitError::NoUpstream);
    }

    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        ["push"],
        NETWORK_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git push failed")?;

    let upstream = upstream.unwrap();
    let (remote, branch) = split_upstream(&upstream);
    Ok(GitPushResult {
        remote,
        branch,
        pushed: true,
    })
}

const LOG_FORMAT: &str = "%H%x1f%an%x1f%ae%x1f%at%x1f%P%x1f%s";
const MAX_LOG_LIMIT: u32 = 200;

pub fn log(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    limit: u32,
    before_sha: Option<&str>,
    workspace: &WorkspaceEnv,
) -> Result<Vec<GitLogEntry>> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    let bounded = limit.clamp(1, MAX_LOG_LIMIT);
    let count_arg = format!("--max-count={bounded}");
    let format_arg = format!("--format={LOG_FORMAT}");
    let cursor = match before_sha {
        Some(sha) if !sha.is_empty() => {
            if !sha_is_safe(sha) {
                return Err(GitError::command("git log", "invalid cursor sha"));
            }
            Some(format!("{sha}^"))
        }
        _ => None,
    };
    let mut args: Vec<&OsStr> = vec![
        OsStr::new("log"),
        OsStr::new("--no-color"),
        OsStr::new("--shortstat"),
        OsStr::new(&count_arg),
        OsStr::new(&format_arg),
    ];
    if let Some(spec) = cursor.as_deref() {
        args.push(OsStr::new(spec));
    }
    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        args,
        DEFAULT_TIMEOUT_SECS,
    )?;
    if output.timed_out {
        return Err(GitError::TimedOut("git log"));
    }
    if output.exit_code != Some(0) {
        let stderr = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
        if stderr.contains("does not have any commits yet")
            || stderr.contains("bad default revision")
            || stderr.contains("unknown revision")
            || stderr.contains("ambiguous argument 'head'")
        {
            return Ok(Vec::new());
        }
        return ensure_success(&output, "git log failed").map(|_| Vec::new());
    }
    let stdout = std::str::from_utf8(&output.stdout).unwrap_or("");
    let mut entries: Vec<GitLogEntry> = Vec::with_capacity(bounded as usize);
    // Lines we get back interleave:
    //   <sha>\x1f<author>\x1f<email>\x1f<ts>\x1f<parents>\x1f<subject>
    //   <blank>
    //    5 files changed, 12 insertions(+), 3 deletions(-)
    // Commits without diffstats (root commits, merges with no changes) just
    // skip the shortstat line. Detect commit headers by the presence of
    // the unit-separator we put in the format.
    for raw_line in stdout.lines() {
        let line = raw_line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        if line.contains('\x1f') {
            let mut fields = line.splitn(6, '\x1f');
            let sha = fields.next().unwrap_or("").to_string();
            if !sha_is_safe(&sha) {
                continue;
            }
            let author = fields.next().unwrap_or("").to_string();
            let author_email = fields.next().unwrap_or("").to_string();
            let timestamp = fields.next().unwrap_or("0").parse::<i64>().unwrap_or(0);
            let parents_raw = fields.next().unwrap_or("");
            let parents: Vec<String> = parents_raw
                .split_ascii_whitespace()
                .map(|s| s.to_string())
                .collect();
            let subject = fields.next().unwrap_or("").to_string();
            let short_sha = sha.chars().take(7).collect::<String>();
            entries.push(GitLogEntry {
                sha,
                short_sha,
                author,
                author_email,
                timestamp_secs: timestamp,
                parents,
                subject,
                files_changed: 0,
                insertions: 0,
                deletions: 0,
            });
            continue;
        }
        if let Some(current) = entries.last_mut() {
            if line.contains("file changed") || line.contains("files changed") {
                let (files, ins, del) = parse_shortstat(line);
                current.files_changed = files;
                current.insertions = ins;
                current.deletions = del;
            }
        }
    }
    Ok(entries)
}

pub fn show_commit_diff(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    sha: &str,
    workspace: &WorkspaceEnv,
) -> Result<GitDiffResult> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    if !sha_is_safe(sha) {
        return Err(GitError::command("git show", "invalid commit identifier"));
    }
    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        [
            OsStr::new("show"),
            OsStr::new("--no-color"),
            OsStr::new("--no-ext-diff"),
            OsStr::new("--patch-with-stat"),
            OsStr::new(sha),
            OsStr::new("--"),
        ],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git show failed")?;
    let diff_text = match String::from_utf8(output.stdout) {
        Ok(text) => text,
        Err(e) => String::from_utf8_lossy(&e.into_bytes()).into_owned(),
    };
    Ok(GitDiffResult {
        diff_text,
        truncated: output.truncated,
    })
}

fn parse_shortstat(tail: &str) -> (u32, u32, u32) {
    // Looks for a line like " 5 files changed, 12 insertions(+), 3 deletions(-)"
    for line in tail.lines() {
        let trimmed = line.trim();
        if !(trimmed.contains("file changed") || trimmed.contains("files changed")) {
            continue;
        }
        let mut files = 0u32;
        let mut ins = 0u32;
        let mut del = 0u32;
        for part in trimmed.split(',') {
            let part = part.trim();
            let num_str = part.split_ascii_whitespace().next().unwrap_or("0");
            let n: u32 = num_str.parse().unwrap_or(0);
            if part.contains("file") {
                files = n;
            } else if part.contains("insertion") {
                ins = n;
            } else if part.contains("deletion") {
                del = n;
            }
        }
        return (files, ins, del);
    }
    (0, 0, 0)
}

fn sha_is_safe(sha: &str) -> bool {
    !sha.is_empty() && sha.len() <= 64 && sha.chars().all(|c| c.is_ascii_hexdigit())
}

pub fn commit_files(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    sha: &str,
    workspace: &WorkspaceEnv,
) -> Result<Vec<GitCommitFileChange>> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    if !sha_is_safe(sha) {
        return Err(GitError::command("git diff-tree", "invalid commit sha"));
    }

    let ns_output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        [
            OsStr::new("diff-tree"),
            OsStr::new("--no-commit-id"),
            OsStr::new("-r"),
            OsStr::new("-z"),
            OsStr::new("--name-status"),
            OsStr::new(sha),
        ],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&ns_output, "git diff-tree --name-status failed")?;
    let mut files = parse_diff_tree_name_status(&ns_output.stdout);

    let num_output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        [
            OsStr::new("diff-tree"),
            OsStr::new("--no-commit-id"),
            OsStr::new("-r"),
            OsStr::new("-z"),
            OsStr::new("--numstat"),
            OsStr::new(sha),
        ],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&num_output, "git diff-tree --numstat failed")?;
    apply_numstat_by_path(&mut files, &num_output.stdout);
    Ok(files)
}

pub fn commit_file_diff(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    sha: &str,
    path: &str,
    original_path: Option<&str>,
    workspace: &WorkspaceEnv,
) -> Result<GitDiffContentResult> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    if !sha_is_safe(sha) {
        return Err(GitError::command("git show", "invalid commit sha"));
    }
    let resolved = resolve_within_repo(&repo_root.local_path, path)?;
    let rel = resolved
        .strip_prefix(&repo_root.local_path)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| path.replace('\\', "/"));

    let original_rel = match original_path {
        Some(orig) if !orig.is_empty() => {
            let resolved_orig = resolve_within_repo(&repo_root.local_path, orig)?;
            resolved_orig
                .strip_prefix(&repo_root.local_path)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|_| orig.replace('\\', "/"))
        }
        _ => rel.clone(),
    };

    let parent = git_stdout_line_opt(
        &repo_root.workspace,
        &repo_root.git_path,
        ["rev-parse", &format!("{sha}^")],
    )?;
    let original = match parent.as_deref() {
        Some(p) => git_show_text(
            &repo_root.workspace,
            &repo_root.git_path,
            &format!("{p}:{original_rel}"),
        )?,
        None => TextSource::Missing,
    };
    let modified = git_show_text(
        &repo_root.workspace,
        &repo_root.git_path,
        &format!("{sha}:{rel}"),
    )?;

    let mut diff_args: Vec<OsString> = vec![
        "show".into(),
        "--no-color".into(),
        "--no-ext-diff".into(),
        "--format=".into(),
        "-m".into(),
        "--first-parent".into(),
        sha.into(),
        "--".into(),
    ];
    diff_args.push(rel.clone().into());
    if original_rel != rel {
        diff_args.push(original_rel.clone().into());
    }
    let patch_output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        diff_args,
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&patch_output, "git show <commit> -- <path> failed")?;
    let patch_text = match String::from_utf8(patch_output.stdout) {
        Ok(text) => text,
        Err(e) => String::from_utf8_lossy(&e.into_bytes()).into_owned(),
    };

    let is_binary =
        matches!(original, TextSource::Binary) || matches!(modified, TextSource::Binary);

    Ok(GitDiffContentResult {
        original_content: original.into_text(),
        modified_content: modified.into_text(),
        is_binary,
        fallback_patch: patch_text,
        truncated: patch_output.truncated,
    })
}

pub fn remote_url(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    name: &str,
    workspace: &WorkspaceEnv,
) -> Result<Option<String>> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    if name.is_empty() || name.len() > 64 || !name.chars().all(is_remote_name_char) {
        return Ok(None);
    }
    git_stdout_line_opt(
        &repo_root.workspace,
        &repo_root.git_path,
        ["config", "--get", &format!("remote.{name}.url")],
    )
}

fn is_remote_name_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.'
}

fn parse_ahead_behind(track: &str) -> (Option<u32>, Option<u32>) {
    if track.is_empty() || track == "gone" {
        return (None, None);
    }
    let mut ahead = None;
    let mut behind = None;
    for part in track.split(',') {
        let part = part.trim();
        if let Some(n) = part.strip_prefix("ahead ") {
            ahead = n.trim().parse().ok();
        } else if let Some(n) = part.strip_prefix("behind ") {
            behind = n.trim().parse().ok();
        }
    }
    (ahead, behind)
}

pub fn list_branches(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<Vec<GitBranchInfo>> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;

    let local_out = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        [
            "branch",
            "--format=%(refname:short)\t%(HEAD)\t%(upstream:short)\t%(upstream:track,nobracket)\t%(committerdate:unix)",
            "--no-color",
        ],
        DEFAULT_TIMEOUT_SECS,
    )?;

    let remote_out = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        ["branch", "-r", "--format=%(refname:short)\t%(committerdate:unix)", "--no-color"],
        DEFAULT_TIMEOUT_SECS,
    )?;

    let local_text = std::str::from_utf8(&local_out.stdout).unwrap_or("").trim();
    let remote_text = std::str::from_utf8(&remote_out.stdout).unwrap_or("").trim();

    // Build a map of branch -> worktree name for branches checked out in other worktrees
    let branch_to_wt: std::collections::HashMap<String, String> = {
        let mut map = std::collections::HashMap::new();
        if let Ok(wt_out) = run_git(
            &repo_root.workspace,
            Some(&repo_root.git_path),
            ["worktree", "list", "--porcelain"],
            DEFAULT_TIMEOUT_SECS,
        ) {
            let repo_canonical = std::fs::canonicalize(&repo_root.local_path)
                .unwrap_or_else(|_| repo_root.local_path.clone());
            let text = String::from_utf8_lossy(&wt_out.stdout);
            let mut cur_path: Option<std::path::PathBuf> = None;
            let mut cur_branch: Option<String> = None;
            for line in text.lines() {
                if line.starts_with("worktree ") {
                    if let (Some(path), Some(branch)) = (cur_path.take(), cur_branch.take()) {
                        let wt_canonical = std::fs::canonicalize(&path).unwrap_or(path.clone());
                        if wt_canonical != repo_canonical {
                            let wt_name = path
                                .file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("worktree")
                                .to_owned();
                            map.insert(branch, wt_name);
                        }
                    }
                    cur_path = Some(std::path::PathBuf::from(line["worktree ".len()..].trim()));
                    cur_branch = None;
                } else if let Some(rest) = line.strip_prefix("branch refs/heads/") {
                    cur_branch = Some(rest.trim().to_owned());
                }
            }
            if let (Some(path), Some(branch)) = (cur_path, cur_branch) {
                let wt_canonical = std::fs::canonicalize(&path).unwrap_or(path.clone());
                if wt_canonical != repo_canonical {
                    let wt_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("worktree")
                        .to_owned();
                    map.insert(branch, wt_name);
                }
            }
        }
        map
    };

    let mut branches: Vec<GitBranchInfo> = Vec::new();

    for line in local_text.lines() {
        let mut parts = line.splitn(5, '\t');
        let name = match parts.next() {
            Some(n) => n.trim(),
            None => continue,
        };
        if name.is_empty() {
            continue;
        }
        let is_current = parts.next().map(|s| s.trim() == "*").unwrap_or(false);
        let upstream = parts.next().and_then(|s| {
            let s = s.trim();
            if s.is_empty() { None } else { Some(s.to_string()) }
        });
        let (ahead, behind) = parts
            .next()
            .map(|s| parse_ahead_behind(s.trim()))
            .unwrap_or((None, None));
        let last_commit_at = parts
            .next()
            .and_then(|s| s.trim().parse::<i64>().ok())
            .filter(|&t| t > 0);
        let worktree = if is_current { None } else { branch_to_wt.get(name).cloned() };
        branches.push(GitBranchInfo {
            name: name.to_string(),
            is_current,
            is_remote: false,
            remote: None,
            upstream,
            worktree,
            ahead,
            behind,
            last_commit_at,
        });
    }

    let local_names: std::collections::HashSet<String> =
        branches.iter().map(|b| b.name.clone()).collect();

    let mut remote_branches: Vec<GitBranchInfo> = Vec::new();
    for line in remote_text.lines() {
        let mut parts = line.splitn(2, '\t');
        let name = match parts.next() {
            Some(n) => n.trim(),
            None => continue,
        };
        if name.is_empty() || name.contains("/HEAD") {
            continue;
        }
        let last_commit_at = parts
            .next()
            .and_then(|s| s.trim().parse::<i64>().ok())
            .filter(|&t| t > 0);
        if let Some(slash_pos) = name.find('/') {
            let remote = name[..slash_pos].to_string();
            let local_branch = &name[slash_pos + 1..];
            if !local_names.contains(local_branch) {
                remote_branches.push(GitBranchInfo {
                    name: name.to_string(),
                    is_current: false,
                    is_remote: true,
                    remote: Some(remote),
                    upstream: None,
                    worktree: None,
                    ahead: None,
                    behind: None,
                    last_commit_at,
                });
            }
        }
    }
    branches.extend(remote_branches);

    Ok(branches)
}

pub fn checkout_branch(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    branch: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;

    if branch.is_empty() || branch.len() > 255 || branch.contains('\0') || branch.contains('\n') {
        return Err(GitError::command("git checkout", "invalid branch name"));
    }

    let output = if let Some(slash_pos) = branch.find('/') {
        let local_name = &branch[slash_pos + 1..];
        let args: Vec<&str> = vec!["checkout", "-b", local_name, "--track", branch];
        run_git(
            &repo_root.workspace,
            Some(&repo_root.git_path),
            args,
            DEFAULT_TIMEOUT_SECS,
        )?
    } else {
        run_git(
            &repo_root.workspace,
            Some(&repo_root.git_path),
            ["checkout", branch],
            DEFAULT_TIMEOUT_SECS,
        )?
    };

    ensure_success(&output, "git checkout failed")
}

pub fn create_branch(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    name: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;

    if name.is_empty() || name.len() > 255 || name.contains('\0') || name.contains('\n') {
        return Err(GitError::command("git checkout", "invalid branch name"));
    }

    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        ["checkout", "-b", name],
        DEFAULT_TIMEOUT_SECS,
    )?;

    ensure_success(&output, "git checkout -b failed")
}

pub fn list_remotes(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<Vec<GitRemoteInfo>> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;

    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        ["remote", "-v"],
        DEFAULT_TIMEOUT_SECS,
    )?;

    let text = std::str::from_utf8(&output.stdout).unwrap_or("").trim();
    let mut seen: std::collections::HashMap<String, String> = Default::default();

    for line in text.lines() {
        if let Some((name_part, rest)) = line.split_once('\t') {
            let name = name_part.trim().to_string();
            if rest.trim_end().ends_with("(fetch)") {
                let url = rest.trim_end_matches("(fetch)").trim().to_string();
                seen.entry(name).or_insert(url);
            }
        }
    }

    let mut remotes: Vec<GitRemoteInfo> = seen
        .into_iter()
        .map(|(name, url)| GitRemoteInfo { name, url })
        .collect();
    remotes.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(remotes)
}

pub fn add_remote(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    name: &str,
    url: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;

    if name.is_empty() || name.len() > 64 || !name.chars().all(is_remote_name_char) {
        return Err(GitError::command("git remote add", "invalid remote name"));
    }
    if url.is_empty() || url.len() > 2048 {
        return Err(GitError::command("git remote add", "invalid remote URL"));
    }

    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        ["remote", "add", name, url],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git remote add failed")
}

pub fn fetch_remote(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    remote: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;

    if remote.is_empty() || remote.len() > 64 || !remote.chars().all(is_remote_name_char) {
        return Err(GitError::command("git fetch", "invalid remote name"));
    }

    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        ["fetch", remote, "--prune"],
        NETWORK_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git fetch failed")
}

fn parse_diff_tree_name_status(bytes: &[u8]) -> Vec<GitCommitFileChange> {
    let s = std::str::from_utf8(bytes).unwrap_or("");
    let mut tokens = s.split('\0').filter(|t| !t.is_empty());
    let mut files: Vec<GitCommitFileChange> = Vec::new();
    while let Some(status_tok) = tokens.next() {
        let status_char = status_tok.chars().next().unwrap_or(' ');
        if status_char == 'R' || status_char == 'C' {
            let original = match tokens.next() {
                Some(v) => v.to_string(),
                None => break,
            };
            let new_path = match tokens.next() {
                Some(v) => v.to_string(),
                None => break,
            };
            files.push(GitCommitFileChange {
                path: new_path,
                original_path: Some(original),
                status: status_char.to_string(),
                status_label: status_label_for(status_char),
                added: 0,
                removed: 0,
                is_binary: false,
            });
        } else {
            let path = match tokens.next() {
                Some(v) => v.to_string(),
                None => break,
            };
            files.push(GitCommitFileChange {
                path,
                original_path: None,
                status: status_char.to_string(),
                status_label: status_label_for(status_char),
                added: 0,
                removed: 0,
                is_binary: false,
            });
        }
    }
    files
}

fn apply_numstat_by_path(files: &mut [GitCommitFileChange], bytes: &[u8]) {
    // numstat -z format: "<added>\t<removed>\t<path>\0"
    // Binary files:      "-\t-\t<path>\0"
    // Renames:           "<added>\t<removed>\t\0<new_path>\0<old_path>\0"
    let s = std::str::from_utf8(bytes).unwrap_or("");
    let mut tokens = s.split('\0');
    while let Some(header) = tokens.next() {
        if header.is_empty() {
            continue;
        }
        let mut cols = header.splitn(3, '\t');
        let added_raw = cols.next().unwrap_or("0");
        let removed_raw = cols.next().unwrap_or("0");
        let inline_path = cols.next().unwrap_or("");
        let is_binary = added_raw == "-" && removed_raw == "-";
        let added: u32 = if is_binary { 0 } else { added_raw.parse().unwrap_or(0) };
        let removed: u32 = if is_binary { 0 } else { removed_raw.parse().unwrap_or(0) };

        let path = if inline_path.is_empty() {
            // Rename case: next two tokens are new_path then old_path
            let new_path = tokens.next().unwrap_or("").to_string();
            let _ = tokens.next(); // old_path; already captured from name-status
            new_path
        } else {
            inline_path.to_string()
        };

        if path.is_empty() {
            continue;
        }
        if let Some(f) = files
            .iter_mut()
            .find(|f| f.path == path || f.original_path.as_deref() == Some(path.as_str()))
        {
            f.added = added;
            f.removed = removed;
            f.is_binary = is_binary;
        }
    }
}

fn status_label_for(c: char) -> String {
    match c {
        'A' => "Added".into(),
        'M' => "Modified".into(),
        'D' => "Deleted".into(),
        'R' => "Renamed".into(),
        'C' => "Copied".into(),
        'T' => "Type changed".into(),
        'U' => "Unmerged".into(),
        _ => format!("Status {c}"),
    }
}

pub fn fetch(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        ["fetch", "--prune"],
        NETWORK_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git fetch failed")
}

pub fn pull_ff_only(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;
    let output = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        ["pull", "--ff-only"],
        NETWORK_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git pull --ff-only failed")
}

pub fn mv(
    registry: &WorkspaceRegistry,
    from: &str,
    to: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    use crate::modules::workspace::resolve_path;

    let from_path = resolve_path(from, workspace);
    let from_parent = from_path
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| GitError::NotADirectory(from.to_string()))?;

    let cwd = canonical_dir(registry, &from_parent, workspace)?;
    if !registry.is_authorized(&cwd.local_path) {
        return Err(GitError::PathOutsideWorkspace(cwd.local_path));
    }
    ensure_git_available(&cwd.workspace)?;

    let repo_info = resolve_repo_in_authorized(registry, &cwd)?.ok_or_else(|| {
        GitError::CommandFailed {
            context: "not a git repository",
            detail: from.to_string(),
        }
    })?;

    let root_resolved = canonical_dir(registry, &repo_info.repo_root, &cwd.workspace)?;
    let to_path = resolve_path(to, workspace);

    let canonical_from = registry
        .canonicalize_cached(&from_path)
        .map_err(GitError::Io)?;
    let canonical_to = registry
        .canonicalize_cached(to_path.parent().unwrap_or(&to_path))
        .map(|parent| parent.join(to_path.file_name().unwrap_or_default()))
        .map_err(GitError::Io)?;

    let from_rel = canonical_from
        .strip_prefix(&root_resolved.local_path)
        .map(|r| r.to_string_lossy().replace('\\', "/"))
        .map_err(|_| GitError::PathOutsideWorkspace(canonical_from.clone()))?;
    let to_rel = canonical_to
        .strip_prefix(&root_resolved.local_path)
        .map(|r| r.to_string_lossy().replace('\\', "/"))
        .map_err(|_| GitError::PathOutsideWorkspace(canonical_to))?;

    let output = run_git(
        &cwd.workspace,
        Some(&root_resolved.git_path),
        ["mv", "--", &from_rel, &to_rel],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git mv failed")
}

pub fn get_worktree_status(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<GitWorktreeStatus> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;

    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["worktree", "list", "--porcelain"],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git worktree list failed")?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let paths: Vec<String> = stdout
        .lines()
        .filter(|l| l.starts_with("worktree "))
        .map(|l| l["worktree ".len()..].trim().to_owned())
        .collect();

    let count = paths.len();
    if count <= 1 {
        return Ok(GitWorktreeStatus {
            worktree_name: None,
            worktree_count: count,
        });
    }

    let main_path = paths.first().map(|s| s.as_str()).unwrap_or("");
    let repo_canonical = std::fs::canonicalize(repo_root)
        .unwrap_or_else(|_| std::path::PathBuf::from(repo_root));
    let main_canonical = std::fs::canonicalize(main_path)
        .unwrap_or_else(|_| std::path::PathBuf::from(main_path));

    if repo_canonical == main_canonical {
        return Ok(GitWorktreeStatus {
            worktree_name: None,
            worktree_count: count,
        });
    }

    let name = repo_canonical
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("worktree")
        .to_owned();

    Ok(GitWorktreeStatus {
        worktree_name: Some(name),
        worktree_count: count,
    })
}

pub fn list_worktrees(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<Vec<GitWorktreeInfo>> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;

    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["worktree", "list", "--porcelain"],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git worktree list failed")?;

    let repo_canonical = std::fs::canonicalize(&repo.local_path)
        .unwrap_or_else(|_| repo.local_path.clone());

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Collect raw blocks: (path, branch)
    let mut blocks: Vec<(std::path::PathBuf, Option<String>)> = Vec::new();
    let mut cur_path: Option<std::path::PathBuf> = None;
    let mut cur_branch: Option<String> = None;

    for line in stdout.lines() {
        if line.starts_with("worktree ") {
            if let Some(p) = cur_path.take() {
                blocks.push((p, cur_branch.take()));
            }
            cur_path = Some(std::path::PathBuf::from(line["worktree ".len()..].trim()));
            cur_branch = None;
        } else if let Some(rest) = line.strip_prefix("branch refs/heads/") {
            cur_branch = Some(rest.trim().to_owned());
        }
    }
    if let Some(p) = cur_path {
        blocks.push((p, cur_branch));
    }

    let result = blocks
        .into_iter()
        .enumerate()
        .map(|(i, (p, branch))| {
            let canonical = std::fs::canonicalize(&p).unwrap_or_else(|_| p.clone());
            GitWorktreeInfo {
                path: p.to_string_lossy().replace('\\', "/"),
                branch,
                is_current: canonical == repo_canonical,
                is_main: i == 0,
            }
        })
        .collect();

    Ok(result)
}

fn nothing_to_commit(output: &GitOutput) -> bool {
    let stderr = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
    let stdout = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
    stderr.contains("nothing to commit") || stdout.contains("nothing to commit")
}

fn resolve_pathspecs(repo_root: &Path, paths: &[String]) -> Result<Vec<String>> {
    let mut out = Vec::with_capacity(paths.len());
    for p in paths {
        out.push(pathspec_from_input(repo_root, p)?);
    }
    Ok(out)
}

fn pathspec_from_input(repo_root: &Path, rel: &str) -> Result<String> {
    let resolved = resolve_within_repo(repo_root, rel)?;
    Ok(pathspec(repo_root, &resolved))
}

fn pathspec(repo_root: &Path, absolute: &Path) -> String {
    absolute
        .strip_prefix(repo_root)
        .map(|rel| rel.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| absolute.to_string_lossy().replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha_is_safe_accepts_hex() {
        assert!(sha_is_safe("abc123"));
        assert!(sha_is_safe(&"a".repeat(40)));
        assert!(sha_is_safe(&"f".repeat(64)));
    }

    #[test]
    fn sha_is_safe_rejects_non_hex_or_oversize() {
        assert!(!sha_is_safe(""));
        assert!(!sha_is_safe("abcg"));
        assert!(!sha_is_safe("abc 123"));
        assert!(!sha_is_safe(&"a".repeat(65)));
        assert!(!sha_is_safe(";rm -rf /"));
    }

    #[test]
    fn is_remote_name_char_allows_word_and_punct() {
        for c in "abcXYZ012-_.".chars() {
            assert!(is_remote_name_char(c));
        }
        for c in " /:\\?\"'".chars() {
            assert!(!is_remote_name_char(c));
        }
    }

    #[test]
    fn parse_shortstat_pulls_three_counts() {
        let line = " 5 files changed, 12 insertions(+), 3 deletions(-)";
        assert_eq!(parse_shortstat(line), (5, 12, 3));
    }

    #[test]
    fn parse_shortstat_handles_singular_file() {
        let line = " 1 file changed, 1 insertion(+)";
        assert_eq!(parse_shortstat(line), (1, 1, 0));
    }

    #[test]
    fn parse_shortstat_returns_zeros_when_absent() {
        assert_eq!(parse_shortstat("no stat here"), (0, 0, 0));
    }

    #[test]
    fn status_label_for_known_chars() {
        assert_eq!(status_label_for('A'), "Added");
        assert_eq!(status_label_for('M'), "Modified");
        assert_eq!(status_label_for('D'), "Deleted");
        assert_eq!(status_label_for('R'), "Renamed");
        assert_eq!(status_label_for('C'), "Copied");
    }

    #[test]
    fn status_label_for_unknown_falls_back() {
        assert_eq!(status_label_for('X'), "Status X");
    }

    #[test]
    fn looks_like_no_head_recognizes_phrases() {
        let mk = |s: &str| GitOutput {
            stdout: Vec::new(),
            stderr: s.as_bytes().to_vec(),
            exit_code: Some(128),
            timed_out: false,
            truncated: false,
        };
        assert!(looks_like_no_head(&mk(
            "fatal: ambiguous argument 'HEAD': unknown revision"
        )));
        assert!(looks_like_no_head(&mk(
            "fatal: your current branch 'main' does not have any commits yet"
        )));
        assert!(!looks_like_no_head(&mk("fatal: pathspec did not match")));
    }

    use std::process::Command as Cmd;
    use crate::modules::workspace::{WorkspaceEnv, WorkspaceRegistry};

    fn git_init_with_commit(dir: &std::path::Path) {
        Cmd::new("git").arg("init").current_dir(dir).status().unwrap();
        Cmd::new("git").args(["config", "user.email", "t@t.com"]).current_dir(dir).status().unwrap();
        Cmd::new("git").args(["config", "user.name", "T"]).current_dir(dir).status().unwrap();
        std::fs::write(dir.join("a.txt"), b"hello").unwrap();
        Cmd::new("git").args(["add", "a.txt"]).current_dir(dir).status().unwrap();
        Cmd::new("git").args(["commit", "-m", "init"]).current_dir(dir).status().unwrap();
    }

    #[test]
    fn mv_tracked_file_moves_and_stages_rename() {
        let dir = tempfile::tempdir().unwrap();
        git_init_with_commit(dir.path());

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let from = dir.path().join("a.txt").to_string_lossy().into_owned();
        let to = dir.path().join("b.txt").to_string_lossy().into_owned();

        super::mv(&registry, &from, &to, &WorkspaceEnv::Local).unwrap();

        assert!(!dir.path().join("a.txt").exists());
        assert!(dir.path().join("b.txt").exists());

        let output = Cmd::new("git")
            .args(["status", "--porcelain"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        let status = String::from_utf8_lossy(&output.stdout);
        assert!(status.contains("R "), "expected staged rename, got: {status}");
    }

    #[test]
    fn mv_untracked_file_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        git_init_with_commit(dir.path());
        std::fs::write(dir.path().join("new.txt"), b"x").unwrap();

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let from = dir.path().join("new.txt").to_string_lossy().into_owned();
        let to = dir.path().join("moved.txt").to_string_lossy().into_owned();

        let result = super::mv(&registry, &from, &to, &WorkspaceEnv::Local);
        assert!(result.is_err(), "expected error for untracked file");
    }

    #[test]
    fn resolve_repo_from_file_in_nested_repo_picks_nearest() {
        let dir = tempfile::tempdir().unwrap();
        git_init_with_commit(dir.path());

        let inner = dir.path().join("inner");
        std::fs::create_dir(&inner).unwrap();
        git_init_with_commit(&inner);
        Cmd::new("git")
            .args(["checkout", "-b", "nested"])
            .current_dir(&inner)
            .status()
            .unwrap();

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let file = inner.join("a.txt").to_string_lossy().into_owned();
        let info = super::resolve_repo(&registry, &file, &WorkspaceEnv::Local)
            .unwrap()
            .expect("expected a repo for a file inside the nested repo");

        assert_eq!(info.branch, "nested");
        assert!(
            info.repo_root.replace('\\', "/").ends_with("/inner"),
            "expected the nested repo root, got: {}",
            info.repo_root
        );
    }

    #[test]
    fn resolve_repo_flags_linked_worktree() {
        let dir = tempfile::tempdir().unwrap();
        git_init_with_commit(dir.path());

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let main = super::resolve_repo(
            &registry,
            &dir.path().to_string_lossy(),
            &WorkspaceEnv::Local,
        )
        .unwrap()
        .expect("expected a repo for the main worktree");
        assert!(!main.is_worktree, "main worktree should not be flagged");

        let wt = dir.path().join("wt");
        Cmd::new("git")
            .args(["worktree", "add", "-b", "feature", wt.to_str().unwrap()])
            .current_dir(dir.path())
            .status()
            .unwrap();

        let linked = super::resolve_repo(&registry, &wt.to_string_lossy(), &WorkspaceEnv::Local)
            .unwrap()
            .expect("expected a repo for the linked worktree");
        assert!(linked.is_worktree, "linked worktree should be flagged");
        assert_eq!(linked.branch, "feature");
    }

    #[test]
    fn mv_outside_repo_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("x.txt"), b"y").unwrap();

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let from = dir.path().join("x.txt").to_string_lossy().into_owned();
        let to = dir.path().join("y.txt").to_string_lossy().into_owned();

        let result = super::mv(&registry, &from, &to, &WorkspaceEnv::Local);
        assert!(result.is_err(), "expected error outside git repo");
    }

    #[test]
    fn list_branches_returns_current_branch() {
        let dir = tempfile::tempdir().unwrap();
        git_init_with_commit(dir.path());

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let root = dir.path().to_string_lossy().into_owned();
        let branches = super::list_branches(&registry, &root, &WorkspaceEnv::Local).unwrap();

        assert!(!branches.is_empty(), "expected at least one branch");
        let current = branches.iter().find(|b| b.is_current);
        assert!(current.is_some(), "expected a branch marked as current");
        assert!(!current.unwrap().is_remote, "current branch should not be remote");
    }

    #[test]
    fn list_branches_includes_second_local_branch() {
        let dir = tempfile::tempdir().unwrap();
        git_init_with_commit(dir.path());
        Cmd::new("git")
            .args(["checkout", "-b", "feature"])
            .current_dir(dir.path())
            .status()
            .unwrap();

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let root = dir.path().to_string_lossy().into_owned();
        let branches = super::list_branches(&registry, &root, &WorkspaceEnv::Local).unwrap();

        let names: Vec<&str> = branches.iter().map(|b| b.name.as_str()).collect();
        assert!(names.contains(&"feature"), "expected feature branch, got: {names:?}");
        let feature = branches.iter().find(|b| b.name == "feature").unwrap();
        assert!(feature.is_current, "feature should be current");
    }

    #[test]
    fn checkout_branch_switches_branch() {
        let dir = tempfile::tempdir().unwrap();
        git_init_with_commit(dir.path());
        Cmd::new("git")
            .args(["checkout", "-b", "other"])
            .current_dir(dir.path())
            .status()
            .unwrap();
        Cmd::new("git")
            .args(["checkout", "main"])
            .current_dir(dir.path())
            .status()
            .unwrap();

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let root = dir.path().to_string_lossy().into_owned();
        super::checkout_branch(&registry, &root, "other", &WorkspaceEnv::Local).unwrap();

        let out = Cmd::new("git")
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        let head = String::from_utf8_lossy(&out.stdout).trim().to_string();
        assert_eq!(head, "other");
    }

    #[test]
    fn checkout_branch_rejects_empty_name() {
        let dir = tempfile::tempdir().unwrap();
        git_init_with_commit(dir.path());

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let root = dir.path().to_string_lossy().into_owned();
        let result = super::checkout_branch(&registry, &root, "", &WorkspaceEnv::Local);
        assert!(result.is_err());
    }

    #[test]
    fn list_remotes_returns_empty_for_no_remote() {
        let dir = tempfile::tempdir().unwrap();
        git_init_with_commit(dir.path());

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let root = dir.path().to_string_lossy().into_owned();
        let remotes = super::list_remotes(&registry, &root, &WorkspaceEnv::Local).unwrap();
        assert!(remotes.is_empty());
    }

    #[test]
    fn add_remote_and_list_remotes_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        git_init_with_commit(dir.path());

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let root = dir.path().to_string_lossy().into_owned();
        super::add_remote(
            &registry,
            &root,
            "origin",
            "https://github.com/example/repo.git",
            &WorkspaceEnv::Local,
        )
        .unwrap();

        let remotes = super::list_remotes(&registry, &root, &WorkspaceEnv::Local).unwrap();
        assert_eq!(remotes.len(), 1);
        assert_eq!(remotes[0].name, "origin");
        assert_eq!(remotes[0].url, "https://github.com/example/repo.git");
    }

    #[test]
    fn add_remote_rejects_invalid_name() {
        let dir = tempfile::tempdir().unwrap();
        git_init_with_commit(dir.path());

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let root = dir.path().to_string_lossy().into_owned();
        let result = super::add_remote(
            &registry,
            &root,
            "bad name!",
            "https://github.com/example/repo.git",
            &WorkspaceEnv::Local,
        );
        assert!(result.is_err());
    }

    #[test]
    fn apply_numstat_does_not_break_on_binary_marker() {
        let mut files = vec![
            GitCommitFileChange {
                status: "M".to_string(),
                status_label: "Modified".to_string(),
                path: "text.rs".to_string(),
                original_path: None,
                added: 0,
                removed: 0,
                is_binary: false,
            },
            GitCommitFileChange {
                status: "M".to_string(),
                status_label: "Modified".to_string(),
                path: "image.png".to_string(),
                original_path: None,
                added: 0,
                removed: 0,
                is_binary: false,
            },
        ];
        // numstat -z: "5\t3\ttext.rs\0-\t-\timage.png\0"
        let numstat = b"5\t3\ttext.rs\x00-\t-\timage.png\x00";
        apply_numstat_by_path(&mut files, numstat);
        assert_eq!(files[0].added, 5, "text file added lines");
        assert_eq!(files[0].removed, 3, "text file removed lines");
        assert_eq!(files[0].is_binary, false, "text file is not binary");
        // binary file keeps 0 counts and is marked binary
        assert_eq!(files[1].added, 0, "binary file added must be 0");
        assert_eq!(files[1].removed, 0, "binary file removed must be 0");
        assert_eq!(files[1].is_binary, true, "binary file must be marked");
    }
}

#[cfg(test)]
mod workspace_auth_tests {
    #[test]
    fn repo_root_above_cwd_is_scope_escalation() {
        let cwd = "/home/user/proj/sub";
        let canonical_root = "/home/user/proj";
        let cwd_path = std::path::Path::new(cwd);
        let root_path = std::path::Path::new(canonical_root);
        let is_escalation = cwd_path.starts_with(root_path) && cwd_path != root_path;
        assert!(is_escalation, "must detect escalation");
    }

    #[test]
    fn repo_root_same_as_cwd_is_not_escalation() {
        let cwd = "/home/user/proj";
        let canonical_root = "/home/user/proj";
        let cwd_path = std::path::Path::new(cwd);
        let root_path = std::path::Path::new(canonical_root);
        let is_escalation = cwd_path.starts_with(root_path) && cwd_path != root_path;
        assert!(!is_escalation, "same path is not escalation");
    }

    #[test]
    fn repo_root_under_cwd_is_not_escalation() {
        // Unusual but valid: worktree inside the authorized dir
        let cwd = "/home/user/proj";
        let canonical_root = "/home/user/proj/.claude/worktrees/feat";
        let cwd_path = std::path::Path::new(cwd);
        let root_path = std::path::Path::new(canonical_root);
        let is_escalation = cwd_path.starts_with(root_path) && cwd_path != root_path;
        assert!(!is_escalation, "root under cwd is not escalation");
    }
}

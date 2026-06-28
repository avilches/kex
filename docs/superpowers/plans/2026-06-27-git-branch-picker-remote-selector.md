# Git Branch Picker & Remote Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clickable branch picker (with search and checkout) and a remote selector/adder to the Source Control panel header.

**Architecture:** Three new Rust operations (`list_branches`, `checkout_branch`, `list_remotes`, `add_remote`, `fetch_remote`) feed two new React components (`BranchPicker`, `RemoteSection`) wired into the existing `SourceControlPanel` header. The branch badge becomes a popover-triggered picker; a remote chip appears after the action buttons only when there are 0 or 2+ remotes.

**Tech Stack:** Rust/Tauri commands, React 19, shadcn/ui (Popover, Command, Dialog), cmdk, hugeicons.

## Global Constraints

- No em-dash anywhere in code, comments, or commit messages.
- No emojis anywhere.
- Imports always `@/...` on the frontend, never relative across modules.
- `pnpm only` - no npm/npx/yarn.
- All shortcuts go through the shortcuts registry (no hardcoded key comparisons in handlers).
- Run `pnpm lint`, `pnpm check-types`, `pnpm test`, `cargo clippy`, `cargo test --locked` before claiming done.

---

## File Map

| Action | File |
|--------|------|
| Modify | `src-tauri/src/modules/git/types.rs` |
| Modify | `src-tauri/src/modules/git/operations.rs` |
| Modify | `src-tauri/src/modules/git/commands.rs` |
| Modify | `src-tauri/src/lib.rs` (line ~793) |
| Modify | `src/lib/native.ts` |
| Create | `src/modules/source-control/BranchPicker.tsx` |
| Create | `src/modules/source-control/RemoteSection.tsx` |
| Modify | `src/modules/source-control/useSourceControl.ts` |
| Modify | `src/modules/source-control/useSourceControlPanel.ts` |
| Modify | `src/modules/source-control/SourceControlPanel.tsx` |

---

### Task 1: Rust types

**Files:**
- Modify: `src-tauri/src/modules/git/types.rs`

**Interfaces:**
- Produces: `GitBranchInfo`, `GitRemoteInfo` structs (used by Tasks 2, 3)

- [ ] **Step 1: Add structs to types.rs**

Append after the existing `GitPushResult` struct (line ~117):

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub remote: Option<String>,
    pub upstream: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteInfo {
    pub name: String,
    pub url: String,
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd src-tauri && cargo check 2>&1 | head -20
```

Expected: no errors related to types.rs.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/modules/git/types.rs
git commit -m "feat(git): add GitBranchInfo and GitRemoteInfo types"
```

---

### Task 2: Rust operations

**Files:**
- Modify: `src-tauri/src/modules/git/operations.rs`

**Interfaces:**
- Consumes: `GitBranchInfo`, `GitRemoteInfo` from Task 1
- Produces: `list_branches`, `checkout_branch`, `list_remotes`, `add_remote`, `fetch_remote` functions

- [ ] **Step 1: Write failing tests**

At the bottom of `operations.rs`, inside the existing `#[cfg(test)] mod tests { ... }` block, after the last test, add:

```rust
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd src-tauri && cargo test list_branches checkout_branch list_remotes add_remote 2>&1 | tail -20
```

Expected: multiple test failures with "unresolved function" or similar.

- [ ] **Step 3: Implement list_branches**

In `operations.rs`, after the `remote_url` function (around line 825), add:

```rust
pub fn list_branches(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<Vec<crate::modules::git::types::GitBranchInfo>> {
    use crate::modules::git::types::GitBranchInfo;
    let repo_root = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo_root.workspace)?;

    let local_out = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        [
            "branch",
            "--format=%(refname:short)\t%(HEAD)\t%(upstream:short)",
            "--no-color",
        ],
        DEFAULT_TIMEOUT_SECS,
    )?;

    let remote_out = run_git(
        &repo_root.workspace,
        Some(&repo_root.git_path),
        [
            "branch",
            "-r",
            "--format=%(refname:short)",
            "--no-color",
        ],
        DEFAULT_TIMEOUT_SECS,
    )?;

    let local_text = std::str::from_utf8(&local_out.stdout).unwrap_or("").trim();
    let remote_text = std::str::from_utf8(&remote_out.stdout).unwrap_or("").trim();

    let mut branches: Vec<GitBranchInfo> = Vec::new();

    for line in local_text.lines() {
        let mut parts = line.splitn(3, '\t');
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
            if s.is_empty() {
                None
            } else {
                Some(s.to_string())
            }
        });
        branches.push(GitBranchInfo {
            name: name.to_string(),
            is_current,
            is_remote: false,
            remote: None,
            upstream,
        });
    }

    let local_names: std::collections::HashSet<&str> =
        branches.iter().map(|b| b.name.as_str()).collect();

    for line in remote_text.lines() {
        let name = line.trim();
        if name.is_empty() || name.contains("/HEAD") {
            continue;
        }
        if let Some(slash_pos) = name.find('/') {
            let remote = name[..slash_pos].to_string();
            let local_branch = &name[slash_pos + 1..];
            if !local_names.contains(local_branch) {
                branches.push(GitBranchInfo {
                    name: name.to_string(),
                    is_current: false,
                    is_remote: true,
                    remote: Some(remote),
                    upstream: None,
                });
            }
        }
    }

    Ok(branches)
}
```

- [ ] **Step 4: Implement checkout_branch**

Add after `list_branches`:

```rust
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

    // Remote tracking branch (e.g. "origin/feature"): create local with tracking.
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
```

- [ ] **Step 5: Implement list_remotes**

Add after `checkout_branch`:

```rust
pub fn list_remotes(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<Vec<crate::modules::git::types::GitRemoteInfo>> {
    use crate::modules::git::types::GitRemoteInfo;
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
```

- [ ] **Step 6: Implement add_remote**

Add after `list_remotes`:

```rust
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
```

- [ ] **Step 7: Implement fetch_remote**

Add after `add_remote` (and before `fetch`):

```rust
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
```

- [ ] **Step 8: Add missing import to operations.rs**

At the top of `operations.rs`, add `GitBranchInfo` and `GitRemoteInfo` to the types import:

```rust
use crate::modules::git::types::{
    DiscardEntry, GitBranchInfo, GitCommitFileChange, GitCommitResult, GitDiffContentResult,
    GitDiffResult, GitLogEntry, GitOutput, GitPanelSnapshot, GitPushResult, GitRemoteInfo,
    GitRepoInfo, GitStatusSnapshot, TextSource, DEFAULT_TIMEOUT_SECS, NETWORK_TIMEOUT_SECS,
};
```

- [ ] **Step 9: Run tests**

```bash
cd src-tauri && cargo test list_branches checkout_branch list_remotes add_remote 2>&1 | tail -30
```

Expected: all 6 new tests pass.

- [ ] **Step 10: Run full cargo test**

```bash
cd src-tauri && cargo test --locked 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add src-tauri/src/modules/git/operations.rs
git commit -m "feat(git): add list_branches, checkout_branch, list_remotes, add_remote, fetch_remote operations"
```

---

### Task 3: Rust commands + lib.rs registration

**Files:**
- Modify: `src-tauri/src/modules/git/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: operations from Task 2
- Produces: `git_list_branches`, `git_checkout_branch`, `git_list_remotes`, `git_add_remote`, `git_fetch_remote` Tauri commands

- [ ] **Step 1: Add commands to commands.rs**

At the top of `commands.rs`, extend the types import to include `GitBranchInfo` and `GitRemoteInfo`:

```rust
use crate::modules::git::types::{
    DiscardEntry, GitBranchInfo, GitCommitFileChange, GitCommitResult, GitDiffContentResult,
    GitDiffResult, GitLogEntry, GitPanelSnapshot, GitPushResult, GitRemoteInfo, GitRepoInfo,
    GitStatusSnapshot,
};
```

Then append at the end of `commands.rs` (after `git_mv`):

```rust
#[tauri::command]
pub async fn git_list_branches(
    repo_root: String,
    workspace: Option<WorkspaceEnv>,
    app: AppHandle,
) -> Result<Vec<GitBranchInfo>, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    blocking(app, move |r| {
        operations::list_branches(r, &repo_root, &workspace).map_err(Into::into)
    })
    .await
}

#[tauri::command]
pub async fn git_checkout_branch(
    repo_root: String,
    branch: String,
    workspace: Option<WorkspaceEnv>,
    app: AppHandle,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    blocking(app, move |r| {
        operations::checkout_branch(r, &repo_root, &branch, &workspace).map_err(Into::into)
    })
    .await
}

#[tauri::command]
pub async fn git_list_remotes(
    repo_root: String,
    workspace: Option<WorkspaceEnv>,
    app: AppHandle,
) -> Result<Vec<GitRemoteInfo>, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    blocking(app, move |r| {
        operations::list_remotes(r, &repo_root, &workspace).map_err(Into::into)
    })
    .await
}

#[tauri::command]
pub async fn git_add_remote(
    repo_root: String,
    name: String,
    url: String,
    workspace: Option<WorkspaceEnv>,
    app: AppHandle,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    blocking(app, move |r| {
        operations::add_remote(r, &repo_root, &name, &url, &workspace).map_err(Into::into)
    })
    .await
}

#[tauri::command]
pub async fn git_fetch_remote(
    repo_root: String,
    remote: String,
    workspace: Option<WorkspaceEnv>,
    app: AppHandle,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    blocking(app, move |r| {
        operations::fetch_remote(r, &repo_root, &remote, &workspace).map_err(Into::into)
    })
    .await
}
```

- [ ] **Step 2: Register in lib.rs**

In `lib.rs`, after line `git::commands::git_mv,` (around line 793), add:

```rust
            git::commands::git_list_branches,
            git::commands::git_checkout_branch,
            git::commands::git_list_remotes,
            git::commands::git_add_remote,
            git::commands::git_fetch_remote,
```

- [ ] **Step 3: Verify compilation**

```bash
cd src-tauri && cargo clippy 2>&1 | grep -E "^error" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/modules/git/commands.rs src-tauri/src/lib.rs
git commit -m "feat(git): register branch and remote Tauri commands"
```

---

### Task 4: Frontend types + native bindings

**Files:**
- Modify: `src/lib/native.ts`

**Interfaces:**
- Produces: `GitBranchInfo`, `GitRemoteInfo` TS types; `native.gitListBranches`, `native.gitCheckoutBranch`, `native.gitListRemotes`, `native.gitAddRemote`, `native.gitFetchRemote` methods

- [ ] **Step 1: Add types to native.ts**

After the `GitPanelSnapshot` type (around line 120 in `native.ts`), add:

```typescript
export type GitBranchInfo = {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  remote: string | null;
  upstream: string | null;
};

export type GitRemoteInfo = {
  name: string;
  url: string;
};
```

- [ ] **Step 2: Add native methods**

In the `native` object, after `gitRemoteUrl` (the last git method, around line 308), add:

```typescript
  gitListBranches: (repoRoot: string) =>
    invoke<GitBranchInfo[]>("git_list_branches", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitCheckoutBranch: (repoRoot: string, branch: string) =>
    invoke<void>("git_checkout_branch", {
      repoRoot,
      branch,
      workspace: currentWorkspaceEnv(),
    }),
  gitListRemotes: (repoRoot: string) =>
    invoke<GitRemoteInfo[]>("git_list_remotes", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitAddRemote: (repoRoot: string, name: string, url: string) =>
    invoke<void>("git_add_remote", {
      repoRoot,
      name,
      url,
      workspace: currentWorkspaceEnv(),
    }),
  gitFetchRemote: (repoRoot: string, remote: string) =>
    invoke<void>("git_fetch_remote", {
      repoRoot,
      remote,
      workspace: currentWorkspaceEnv(),
    }),
```

- [ ] **Step 3: Type-check**

```bash
pnpm check-types 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/native.ts
git commit -m "feat(git): add branch and remote native bindings"
```

---

### Task 5: BranchPicker component

**Files:**
- Create: `src/modules/source-control/BranchPicker.tsx`

**Interfaces:**
- Consumes: `GitBranchInfo` from Task 4; `native.gitListBranches` (called via callback prop)
- Produces: `<BranchPicker>` component

- [ ] **Step 1: Create BranchPicker.tsx**

```typescript
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { GitBranchInfo } from "@/lib/native";
import { cn } from "@/lib/utils";
import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

type Props = {
  currentBranch: string;
  isDetached: boolean;
  disabled: boolean;
  onFetchBranches: () => Promise<GitBranchInfo[]>;
  onCheckout: (branch: GitBranchInfo) => Promise<void>;
};

export function BranchPicker({
  currentBranch,
  isDetached,
  disabled,
  onFetchBranches,
  onCheckout,
}: Props) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranchInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && branches === null) {
      setLoading(true);
      try {
        setBranches(await onFetchBranches());
      } catch {
        setBranches([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSelect = async (branch: GitBranchInfo) => {
    if (branch.isCurrent) {
      setOpen(false);
      return;
    }
    setBusyName(branch.name);
    try {
      await onCheckout(branch);
      // Refresh list so new current is reflected
      setBranches(await onFetchBranches());
      setOpen(false);
    } catch {
      // Parent shows the error via actionError toast
    } finally {
      setBusyName(null);
    }
  };

  const label = isDetached ? "detached" : currentBranch;

  if (isDetached || disabled) {
    return (
      <div className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1 text-[11.5px] font-medium leading-tight text-foreground">
        <HugeiconsIcon
          icon={GitBranchIcon}
          size={12}
          strokeWidth={1.9}
          className="shrink-0 text-muted-foreground"
        />
        <span className="truncate">{label}</span>
      </div>
    );
  }

  const localBranches = (branches ?? []).filter((b) => !b.isRemote);
  const remoteBranches = (branches ?? []).filter((b) => b.isRemote);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1 text-[11.5px] font-medium leading-tight text-foreground transition-colors hover:bg-foreground/10"
        >
          <HugeiconsIcon
            icon={GitBranchIcon}
            size={12}
            strokeWidth={1.9}
            className="shrink-0 text-muted-foreground"
          />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" side="bottom">
        <Command>
          <CommandInput
            placeholder="Filter branches..."
            className="h-8 text-[11.5px]"
          />
          <CommandList className="max-h-64">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner className="size-4" />
              </div>
            ) : (
              <>
                <CommandEmpty className="py-3 text-center text-[11px] text-muted-foreground">
                  No branches found
                </CommandEmpty>
                {localBranches.length > 0 && (
                  <CommandGroup heading="Local">
                    {localBranches.map((b) => (
                      <BranchItem
                        key={b.name}
                        branch={b}
                        busyName={busyName}
                        onSelect={handleSelect}
                      />
                    ))}
                  </CommandGroup>
                )}
                {remoteBranches.length > 0 && (
                  <CommandGroup heading="Remote">
                    {remoteBranches.map((b) => (
                      <BranchItem
                        key={b.name}
                        branch={b}
                        busyName={busyName}
                        onSelect={handleSelect}
                      />
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function BranchItem({
  branch,
  busyName,
  onSelect,
}: {
  branch: GitBranchInfo;
  busyName: string | null;
  onSelect: (b: GitBranchInfo) => void;
}) {
  const isBusy = busyName === branch.name;
  return (
    <CommandItem
      value={branch.name}
      onSelect={() => onSelect(branch)}
      className={cn(
        "flex items-center gap-2 text-[11.5px]",
        branch.isCurrent && "font-semibold",
      )}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {isBusy ? (
          <Spinner className="size-3" />
        ) : (
          <HugeiconsIcon
            icon={GitBranchIcon}
            size={12}
            strokeWidth={1.9}
            className={cn(
              branch.isCurrent
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{branch.name}</span>
      {branch.isCurrent && (
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          current
        </span>
      )}
    </CommandItem>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm check-types 2>&1 | grep "BranchPicker" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/source-control/BranchPicker.tsx
git commit -m "feat(scm): add BranchPicker component"
```

---

### Task 6: RemoteSection component

**Files:**
- Create: `src/modules/source-control/RemoteSection.tsx`

**Interfaces:**
- Consumes: `GitRemoteInfo` from Task 4
- Produces: `<RemoteSection>` component (handles 0-remote "Add remote" and multi-remote picker)

- [ ] **Step 1: Create RemoteSection.tsx**

```typescript
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { GitRemoteInfo } from "@/lib/native";
import { cn } from "@/lib/utils";
import { Add01Icon, GlobalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, type FormEvent } from "react";

type Props = {
  remotes: GitRemoteInfo[];
  selectedRemote: string | null;
  busy: boolean;
  onSelectRemote: (name: string) => void;
  onAddRemote: (name: string, url: string) => Promise<void>;
};

export function RemoteSection({
  remotes,
  selectedRemote,
  busy,
  onSelectRemote,
  onAddRemote,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);

  if (remotes.length === 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          title="No remote configured - click to add one"
          className="inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        >
          <HugeiconsIcon icon={Add01Icon} size={10} strokeWidth={2} />
          Add remote
        </button>
        <AddRemoteDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onAdd={onAddRemote}
        />
      </>
    );
  }

  if (remotes.length === 1) {
    return null;
  }

  const activeRemote = selectedRemote ?? remotes[0]?.name ?? "";

  return (
    <RemotePicker
      remotes={remotes}
      activeRemote={activeRemote}
      busy={busy}
      onSelect={onSelectRemote}
    />
  );
}

function RemotePicker({
  remotes,
  activeRemote,
  busy,
  onSelect,
}: {
  remotes: GitRemoteInfo[];
  activeRemote: string;
  busy: boolean;
  onSelect: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          title="Select active remote"
          className={cn(
            "inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors",
            busy
              ? "cursor-default opacity-50"
              : "hover:bg-muted/70 hover:text-foreground",
          )}
        >
          <HugeiconsIcon icon={GlobalIcon} size={10} strokeWidth={2} />
          <span>{activeRemote}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="start" side="bottom">
        <div className="space-y-0.5">
          {remotes.map((r) => (
            <button
              key={r.name}
              type="button"
              onClick={() => {
                onSelect(r.name);
                setOpen(false);
              }}
              className={cn(
                "flex w-full flex-col rounded px-2 py-1.5 text-left transition-colors hover:bg-accent",
                activeRemote === r.name && "bg-accent/60",
              )}
            >
              <span className="text-[11px] font-medium">{r.name}</span>
              <span className="min-w-0 truncate text-[9px] text-muted-foreground">
                {r.url}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AddRemoteDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (name: string, url: string) => Promise<void>;
}) {
  const [name, setName] = useState("origin");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = (o: boolean) => {
    if (!busy) {
      onOpenChange(o);
      if (!o) setError(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const u = url.trim();
    if (!n || !u) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(n, u);
      setUrl("");
      onOpenChange(false);
    } catch (err) {
      setError(
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : "Failed to add remote",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Add remote</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="origin"
              className="h-8 text-xs"
              disabled={busy}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">
              URL
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="h-8 text-xs"
              disabled={busy}
            />
          </div>
          {error ? (
            <p className="text-[11px] text-destructive">{error}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy || !name.trim() || !url.trim()}
            >
              {busy ? "Adding..." : "Add remote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm check-types 2>&1 | grep "RemoteSection\|AddRemoteDialog\|RemotePicker" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/source-control/RemoteSection.tsx
git commit -m "feat(scm): add RemoteSection component with remote picker and add-remote dialog"
```

---

### Task 7: Wire into useSourceControl + useSourceControlPanel + SourceControlPanel

**Files:**
- Modify: `src/modules/source-control/useSourceControl.ts`
- Modify: `src/modules/source-control/useSourceControlPanel.ts`
- Modify: `src/modules/source-control/SourceControlPanel.tsx`

**Interfaces:**
- Consumes: components from Tasks 5-6; native bindings from Task 4
- Produces: functional branch picker + remote section in the SCM panel header

#### 7a: Extend useSourceControl.ts

The `runRemoteAction` needs to accept an optional `remote` to target for fetch operations.

- [ ] **Step 1: Extend SourceControlSummary type**

In `useSourceControl.ts`, change the `runRemoteAction` signature in `SourceControlSummary` from:

```typescript
  runRemoteAction: (
    mode?: SourceControlRemoteActionMode,
  ) => Promise<SourceControlRemoteActionResult>;
```

to:

```typescript
  runRemoteAction: (
    mode?: SourceControlRemoteActionMode,
    options?: { remote?: string },
  ) => Promise<SourceControlRemoteActionResult>;
```

- [ ] **Step 2: Extend runRemoteAction implementation**

In `useSourceControl.ts`, change the `runRemoteAction` callback signature from:

```typescript
    async (
      mode: SourceControlRemoteActionMode = "contextual",
    ): Promise<SourceControlRemoteActionResult> => {
```

to:

```typescript
    async (
      mode: SourceControlRemoteActionMode = "contextual",
      options?: { remote?: string },
    ): Promise<SourceControlRemoteActionResult> => {
```

And change the fetch block inside `runRemoteAction` from:

```typescript
        if (action === "fetch") {
          await native.gitFetch(repo.repoRoot);
          touchAutoFetch(autoFetchByRepoRef.current, repo.repoRoot);
```

to:

```typescript
        if (action === "fetch") {
          if (options?.remote) {
            await native.gitFetchRemote(repo.repoRoot, options.remote);
          } else {
            await native.gitFetch(repo.repoRoot);
          }
          touchAutoFetch(autoFetchByRepoRef.current, repo.repoRoot);
```

Also update the return value in `useMemo` — the `runRemoteAction` reference is already included, no change needed there.

#### 7b: Extend useSourceControlPanel.ts

- [ ] **Step 3: Add new state and methods**

At the top of `useSourceControlPanel.ts`, add the import:

```typescript
import type { GitBranchInfo, GitRemoteInfo } from "@/lib/native";
```

In the `SourceControlPanelState` type (around line 45), add these fields after `pendingDiscard`:

```typescript
  remotes: GitRemoteInfo[];
  remotesLoading: boolean;
  selectedRemote: string | null;
  setSelectedRemote: (name: string) => void;
  fetchBranches: () => Promise<GitBranchInfo[]>;
  checkout: (branch: GitBranchInfo) => Promise<void>;
  addRemote: (name: string, url: string) => Promise<void>;
```

- [ ] **Step 4: Add state variables inside useSourceControlPanel**

Inside `useSourceControlPanel`, after the `[pendingDiscard, setPendingDiscard]` useState (around line 333), add:

```typescript
  const [remotes, setRemotes] = useState<GitRemoteInfo[]>([]);
  const [remotesLoading, setRemotesLoading] = useState(false);
  const [selectedRemote, setSelectedRemote] = useState<string | null>(null);
```

- [ ] **Step 5: Add loadRemotes, fetchBranches, checkout, addRemote callbacks**

After the `cancelReconcile` / `scheduleReconcile` callbacks, add:

```typescript
  const loadRemotes = useCallback(async () => {
    if (!repo) return;
    setRemotesLoading(true);
    try {
      const list = await native.gitListRemotes(repo.repoRoot);
      setRemotes(list);
      setSelectedRemote((current) => {
        if (current && list.some((r) => r.name === current)) return current;
        const trackingRemote = status?.upstream?.split("/")[0] ?? null;
        return (
          list.find((r) => r.name === trackingRemote)?.name ??
          list[0]?.name ??
          null
        );
      });
    } catch {
      setRemotes([]);
    } finally {
      setRemotesLoading(false);
    }
  }, [repo, status?.upstream]);

  const fetchBranches = useCallback(async (): Promise<GitBranchInfo[]> => {
    if (!repo) return [];
    return native.gitListBranches(repo.repoRoot);
  }, [repo]);

  const checkout = useCallback(
    async (branch: GitBranchInfo) => {
      if (!repo) return;
      setLocalActionBusy("checkout");
      setActionMessage(null);
      setActionError(null);
      try {
        await native.gitCheckoutBranch(repo.repoRoot, branch.name);
        const localName = branch.isRemote
          ? branch.name.slice(branch.name.indexOf("/") + 1)
          : branch.name;
        setActionMessage(`Switched to ${localName}`);
        await summary.refresh({ remote: "never" });
      } catch (error) {
        setActionError(normalizeError(error));
      } finally {
        setLocalActionBusy(null);
      }
    },
    [repo, summary],
  );

  const addRemote = useCallback(
    async (name: string, url: string) => {
      if (!repo) return;
      setLocalActionBusy("add-remote");
      setActionMessage(null);
      setActionError(null);
      try {
        await native.gitAddRemote(repo.repoRoot, name, url);
        const list = await native.gitListRemotes(repo.repoRoot);
        setRemotes(list);
        setSelectedRemote(name);
        setActionMessage(`Remote "${name}" added`);
      } catch (error) {
        setActionError(normalizeError(error));
      } finally {
        setLocalActionBusy(null);
      }
    },
    [repo],
  );
```

- [ ] **Step 6: Load remotes when panel becomes ready**

After the `useEffect` that drives panel state (the one that calls `setPanelState("ready")`, ending around line 492 in the original), add:

```typescript
  useEffect(() => {
    if (panelState === "ready") {
      void loadRemotes();
    }
  }, [panelState, loadRemotes]);
```

- [ ] **Step 7: Add new fields to the return object**

In the `return { ... }` at the end of `useSourceControlPanel`, add after `pendingDiscard`:

```typescript
    remotes,
    remotesLoading,
    selectedRemote,
    setSelectedRemote,
    fetchBranches,
    checkout,
    addRemote,
```

#### 7c: Update SourceControlPanel.tsx

- [ ] **Step 8: Add imports**

At the top of `SourceControlPanel.tsx`, add:

```typescript
import { BranchPicker } from "./BranchPicker";
import { RemoteSection } from "./RemoteSection";
```

- [ ] **Step 9: Replace branch badge with BranchPicker**

In `SourceControlPanel.tsx`, find the branch badge block (around line 639):

```typescript
              <div className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1 text-[11.5px] font-medium leading-tight text-foreground">
                <HugeiconsIcon
                  icon={GitBranchIcon}
                  size={12}
                  strokeWidth={1.9}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="truncate">{repoLabel}</span>
              </div>
```

Replace it with:

```typescript
              <BranchPicker
                currentBranch={repoLabel}
                isDetached={scm.status?.isDetached ?? false}
                disabled={!scm.repo || !!scm.actionBusy}
                onFetchBranches={scm.fetchBranches}
                onCheckout={scm.checkout}
              />
```

- [ ] **Step 10: Remove the now-redundant detached badge**

After the `BranchPicker`, remove the separate detached badge block:

```typescript
              {scm.status?.isDetached ? (
                <span className="rounded bg-muted/55 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  detached
                </span>
              ) : null}
```

The `BranchPicker` already shows "detached" in the non-interactive mode.

- [ ] **Step 11: Add RemoteSection after action buttons**

In `SourceControlPanel.tsx`, the first header row ends with the action buttons `<div className="flex shrink-0 items-center gap-0.5">...</div>`. After that closing `</div>`, add `<RemoteSection>`:

```typescript
              </div>
              <RemoteSection
                remotes={scm.remotes}
                selectedRemote={scm.selectedRemote}
                busy={!!scm.actionBusy || !!sourceControl.busyAction}
                onSelectRemote={scm.setSelectedRemote}
                onAddRemote={scm.addRemote}
              />
```

- [ ] **Step 12: Pass selectedRemote to handleFetch**

In `SourceControlPanel.tsx`, update `handleFetch`:

```typescript
  const handleFetch = useCallback(() => {
    void sourceControl.runRemoteAction("fetch", {
      remote: scm.selectedRemote ?? undefined,
    });
  }, [sourceControl, scm.selectedRemote]);
```

- [ ] **Step 13: Lint, type-check, test**

```bash
pnpm exec biome lint ./src
pnpm check-types
pnpm test
```

Expected: all pass.

- [ ] **Step 14: Full Rust check**

```bash
cd src-tauri && cargo clippy && cargo test --locked
```

Expected: all pass.

- [ ] **Step 15: Commit**

```bash
git add src/modules/source-control/useSourceControl.ts \
        src/modules/source-control/useSourceControlPanel.ts \
        src/modules/source-control/SourceControlPanel.tsx
git commit -m "feat(scm): wire BranchPicker and RemoteSection into SourceControlPanel"
```

---

## Manual Test Checklist

After all tasks are done, verify in the running app (`pnpm tauri dev`):

**Branch picker:**
- [ ] Click the branch badge in the SCM panel header opens a popover with a search field
- [ ] Local branches appear under "Local" group; remote-only branches under "Remote"
- [ ] Current branch is marked "current" and has bold text
- [ ] Typing in the filter narrows the list
- [ ] Clicking a local branch checks it out and the header updates to the new branch name
- [ ] Clicking a remote branch creates a local tracking branch and checks it out
- [ ] Spinner shows on the clicked branch while checkout is in progress
- [ ] If checkout fails (e.g. uncommitted changes), an error toast appears
- [ ] In detached HEAD state, the badge shows "detached" and is not clickable

**Remote section (0 remotes):**
- [ ] Repo with no remotes shows "Add remote" chip after the push button
- [ ] Clicking "Add remote" opens a dialog with Name (pre-filled "origin") and URL fields
- [ ] Submitting with valid name + URL adds the remote and shows a success toast
- [ ] Submitting with invalid name shows an error inside the dialog
- [ ] After adding, the chip disappears (single remote = no selector shown)

**Remote section (multiple remotes):**
- [ ] Repo with 2+ remotes shows a remote selector chip after the push button
- [ ] Clicking the chip opens a popover listing all remotes with their URLs
- [ ] Selecting a different remote updates the chip label
- [ ] Clicking fetch uses the selected remote (not the tracking upstream)
- [ ] When an action is busy, the chip is visually disabled

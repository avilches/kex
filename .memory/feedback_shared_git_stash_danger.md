---
name: feedback-shared-git-stash-danger
description: Never use git stash or git checkout <ref> -- . for ad-hoc diagnostics in a worktree; the stash list and object store are shared across all worktrees of a repo
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f9621a24-3e1a-4eb1-9e12-97162ca16a05
---

Never run `git stash` / `git stash pop` as a scratch mechanism for a quick diagnostic (e.g. "let me stash, checkout an old commit's file to compare, then pop back"), and never run `git checkout <ref> -- .` (whole-tree checkout) as a read-only comparison trick. Both are unsafe in a `.claude/worktrees/<branch>` setup.

**Why:** `git stash` is a single shared list per repository (stored under the common `.git`), not per-worktree. During one session, `git stash` in a worktree reported "No local changes to save" (correct, nothing to stash there), but a later `git stash pop` in the same throwaway diagnostic still found and attempted to apply an unrelated pre-existing stash entry that belonged to the user's main worktree (`WIP on main: ... perf(explorer)...`, a shadcn/ui component styling experiment). It conflicted with the worktree's own committed files (`context-menu.tsx`, `dropdown-menu.tsx`), leaving merge-conflict markers in files that had nothing to do with the diagnostic. Lucky break: git only drops a stash entry on a clean apply, so the conflict meant the entry survived in the list and was recoverable by restoring the two files to `HEAD` and leaving the stash untouched.

**How to apply:** For any one-off "does this old commit's file differ from HEAD" check, use `git show <ref>:<path> | diff - <(git show HEAD:<path>)` or `git diff <ref> HEAD -- <path>` — these are read-only, never touch the working tree or the shared stash. If a working-tree checkout is genuinely needed for a script, use a disposable clone or `git worktree add` a scratch checkout, never `stash`/`checkout -- .` in a worktree that has real uncommitted state (yours or, as this incident showed, someone else's stash reachable from the same repo). See [[feedback_worktree_ownership]] for the related rule about not touching state outside the worktree you were asked to work in.

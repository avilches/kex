---
name: feedback-sdd-verify-head-parent
description: "When running subagent-driven-development in a shared worktree, verify each implementer's commit parent matches the expected BASE before trusting its diff or dispatching the next task"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f9621a24-3e1a-4eb1-9e12-97162ca16a05
---

After dispatching an implementer subagent (superpowers:subagent-driven-development) without `isolation: "worktree"`, its commit can silently land with the wrong parent: during one run, Task 1's implementer committed `b431ec2` on top of the correct base, but Task 2's implementer (dispatched afterward, in the same shared worktree) produced a commit whose parent was the base *before* Task 1, dropping Task 1's changes from the branch tip and working tree (package.json/node_modules lost the just-added dependencies) even though Task 1's commit object still existed in git (recoverable, not garbage collected) and its own review had already passed.

**Why:** Root cause unconfirmed, suspected subagent sandbox/filesystem snapshotting taking an earlier view of the repo than the one visible in the controller's session at dispatch time. `git reflog` on the branch showed no explicit reset step between the two commits, just a commit at the older parent, which is the tell: this is silent, not preceded by any visible reset event.

**How to apply:** After every implementer subagent reports DONE and before running `scripts/review-package BASE HEAD`, run `git log --oneline -1 --format=%H\ %P` (or check `git merge-base --is-ancestor BASE HEAD`) to confirm the new commit's parent actually is the BASE you dispatched from. If it is not, the fix is `git rebase --onto <real-previous-tip> <stale-base> <branch>` (safe here because the dropped commit's object still exists), then re-run `pnpm install` and the full test suite before generating the review package, since the working tree (not just history) may have reverted along with it. Treat this check as a required step in the per-task loop, not an occasional sanity check — it is cheap and the failure mode is silent and severe (an entire prior task quietly disappearing from the branch).

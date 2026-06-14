---
name: sync-upstream
description: Sync changes from upstream crynta/terax-ai into this fork, filtering for compatibility with the no-AI philosophy and documenting all divergences in FORK.md
---

# Skill: sync-upstream

This skill orchestrates an upstream sync for the Terax fork. Read all sections before taking any action.

---

## Fork philosophy (internalize before analyzing anything)

This repo is a fork of `crynta/terax-ai`. It removes the AI subsystem entirely and invests that complexity budget into a
deeper workspace/pane model. The upstream continues developing both.

The fork's invariants:

- No AI runtime dependency, no API keys, no keychain access
- Focus: clean, fast, terminal-first workspace with a powerful pane and workspace model
- Ultra-lightweight bundle (~7-8 MB), high-performance terminal
- Any new feature from upstream must be evaluated against these invariants

Read `docs/FORK.md` before proceeding -- specifically the "What has been removed" section. That section is the
authoritative list of removed surface. Future sync runs may have added new entries to it.

---

## Step 1 -- Verify upstream remote

First, confirm the working tree is clean. If there are uncommitted changes, stop and ask the user to commit or stash
before proceeding -- a dirty tree will contaminate cherry-picks and manual merges.

This applies to **continuations too**, not just a fresh start. A sync run across multiple sessions tends to accumulate
uncommitted work that entangles with unrelated user WIP in shared files (e.g. `App.tsx`, `PanelContent.tsx`). Once
entangled, neither `git add -p` nor per-file commits can separate sync from WIP cleanly. Establish a commit-barrier:
commit (or stash) each completed sync chunk before the next session, and never let sync edits sit uncommitted next to
unrelated WIP.

```bash
git status --porcelain
```

If the output is not empty: stop and report. Do not proceed.

Then verify the upstream remote:

```bash
git remote -v
```

If `upstream` is not listed, run:

```bash
git remote add upstream https://github.com/crynta/terax-ai.git
```

Then fetch:

```bash
git fetch upstream
```

If the fetch fails (network, auth, etc.), stop and report the error. Do not proceed.

---

## Step 2 -- Determine the starting point

Read `docs/FORK.md`. Find the section `### Upstream sync log` at the end of the file.

- If the section exists: the starting commit (`LAST_SYNC`) is the "Upstream HEAD" SHA from the most recent log entry.
- If the section does not exist: `LAST_SYNC` is the fork point `f69eecc34df5be9aa1b23166de7e84b231bca481`.

Get the current upstream HEAD:

```bash
git rev-parse upstream/main
```

Call this `UPSTREAM_HEAD`.

If `LAST_SYNC == UPSTREAM_HEAD`, there is nothing to sync. Inform the user and stop -- but still confirm the upstream
remote is healthy.

---

## Step 3 -- Get the upstream diff

```bash
git log LAST_SYNC..upstream/main --oneline --no-merges
git log LAST_SYNC..upstream/main --oneline --merges
git diff LAST_SYNC..upstream/main --name-status
```

Record separately: real commits (first command) and merge commits (second command). The merge commit count gives context
on upstream branching activity but those commits are not cherry-pickable and should not be included in the
classification below. Save the real commit count and changed file list -- you will need them for the summary and for the
work plan if one is created.

---

## Step 4 -- Understand the removed surface

From `docs/FORK.md` "What has been removed", extract:

- Module paths (e.g. `src/modules/ai/`, `src-tauri/src/modules/net.rs`, `src-tauri/src/modules/secrets.rs`)
- Functional areas (e.g. "AI subsystem", "HTTP proxy", "OS keychain", "managed agents store", "AI settings sections")

This is the **removed surface**. Upstream changes that exclusively touch the removed surface will be skipped. Do not
enumerate them file-by-file -- group them by functional area.

---

## Step 5 -- Classify all changes into three buckets

For each file in the upstream diff, classify it:

**Bucket A -- Removed surface**: the file path matches (or is a subdirectory of) a removed module or was explicitly
listed as removed in FORK.md. These changes will be skipped. Aggregate by functional area, not file-by-file.

**Bucket B -- Shared code**: the file exists in this repo and was not removed. For each such file, first check whether
this fork has also modified it since LAST_SYNC:

```bash
git log LAST_SYNC..HEAD --oneline -- <file>
```

If the output is non-empty, the file has diverged in both directions: mark it **requires manual merge** immediately. Do
not attempt a cherry-pick on it.

**Also check the inverse: pre-divergence files.** An empty output above does NOT guarantee a clean cherry-pick. It only
means the fork has not touched the file *since* `LAST_SYNC`. It misses the case where the upstream developed the file
heavily and the fork is still on a much older version inherited from the original fork point (this is common for CI,
infra, and workflow files the fork never syncs individually -- their real common base is the fork point, not
`LAST_SYNC`). A cherry-pick of a recent commit then targets steps/sections the fork never received, and fails or applies
something incoherent. Guard against it:

```bash
git diff HEAD:<file> upstream/main:<file> --stat
```

If a file the fork has NOT modified since `LAST_SYNC` nonetheless differs substantially from `upstream/main` (large line
delta, missing whole sections), the fork is on a pre-divergence version. Mark it **requires manual merge**, never
cherry-pick, and consider whether adopting the upstream's full evolution of that file is separate infra work rather than
part of this sync (record it as a pending improvement and document the divergence in FORK.md). Real example
(2026-06-13): `afd1167` modified a `release.yml` AppImage step the fork never had -- the fork's `release.yml` was 96
lines (original fork point) vs the upstream's 202; `git log LAST_SYNC..HEAD` was empty, so the naive path would have
called it a clean cherry-pick.

Then analyze the upstream diff for this file. Determine:

- Bug fix or correctness improvement (high value, likely merge)
- Performance or bundle-size improvement (high value, likely merge)
- UI/UX polish to a kept feature (evaluate)
- New sub-feature inside a kept module (evaluate against fork philosophy)
- Change entangled with removed AI code (either extract the non-AI part or skip; document your reasoning)

**Bucket C -- New files / new features**: the file does not exist in this repo at all. Determine:

- Is this a terminal, editor, workspace, or pane improvement? (potentially add)
- Does it depend on the AI subsystem, API keys, or keychain? (skip; document as explicitly rejected if the user
  confirms)
- Does it conflict with the fork's lightweight-bundle goal? (evaluate)

For each Bucket C item, write a brief recommendation with your reasoning.

---

## Step 6 -- Build the functional summary

Prepare a concise human-readable summary structured as:

```
1. Ignorado (superficie eliminada)
   - [Functional area]: N commits, M files -- e.g. "Sistema AI: 12 commits, 34 ficheros"

2. Cambios en código compartido (Bucket B)
   - [Description]: [files] -- Recomendación: mezclar / saltar / requiere trabajo manual
   ...

3. Features nuevas (Bucket C)
   - [Feature name]: [brief description] -- Recomendación: añadir / rechazar / evaluar
   ...
```

Be functional, not mechanical. "Se ha mejorado el rendimiento del renderer del terminal" is better than listing five
xterm files.

---

## Step 7 -- Ask the user how to proceed

Show the summary. Then ask:

> "¿Prefieres que proceda directamente con los cambios recomendados, o prefieres un fichero de plan de trabajo en
`docs/upstream-YYYY-mm-dd.md` para revisar y ejecutar después?"

Guidelines for your recommendation -- use these criteria, not vague judgement:

Suggest **direct merge** if ALL of the following are true:

- Bucket B has 5 or fewer files
- None of those files are marked "requires manual merge" (i.e. no fork divergence detected in Step 5)
- Bucket C is empty, or every Bucket C item is clearly rejectable without user deliberation

Suggest **work plan** if ANY of the following is true:

- Any Bucket B file requires manual merge
- Bucket B has more than 5 files
- Any Bucket C item needs user evaluation (your recommendation is "evaluar")
- Any change touches the workspace/pane model (`src/modules/workspaces/`, `splitNode.ts`, workspace state persistence)

Also ask the user to confirm any Bucket C items where your recommendation is "evaluar" -- you need a decision before
proceeding.

---

## Step 7a -- Direct merge path

For each accepted change (Bucket B conflicts the user approved + Bucket C items the user wants):

**Clean cherry-pick** (file only exists in kept code, no fork divergence detected in Step 5, upstream commit does not
touch removed files):

```bash
git cherry-pick <commit-sha>
```

Use the original upstream commit message as-is (the default). Do not alter it.

If the cherry-pick produces conflicts:

- Resolve the conflicted files, then: `git add <file> && git cherry-pick --continue`
- If the conflict cannot be resolved cleanly (AI code entangled): `git cherry-pick --abort`, then proceed as a manual
  merge instead.

**Manual merge** (the file was marked "requires manual merge" in Step 5, or the commit touches both kept and removed
code):

- Read the current file, the upstream diff (`git show <sha> -- <file>`), and apply the upstream change while preserving
  all fork-specific modifications.
- Edit the file directly. Do not cherry-pick.
- Commit with message: `upstream: <original commit subject>` so the provenance is clear in the git log.
- Note what you did and why for the FORK.md log.

**Complex case** (a single upstream commit interleaves AI and non-AI changes so deeply they cannot be separated
cleanly):

- Do not attempt a partial cherry-pick.
- Extract only the non-AI portion via manual edit and commit as above.
- If even that is too risky, skip the commit and document it explicitly in the FORK.md log.

After all accepted changes are applied, run the full quality suite:

```bash
pnpm lint
pnpm check-types
pnpm test
cd src-tauri && cargo clippy && cargo test --locked
```

Fix all errors before proceeding to Step 8. Do not skip or bypass checks.

---

## Step 7b -- Work plan path

Create `docs/upstream-YYYY-mm-dd.md` using today's date. This file must be **fully self-contained**: a new agent reading
it in a fresh session with zero conversation context must be able to execute it completely. The executing agent should
use the `superpowers:executing-plans` skill to run this plan with review checkpoints.

**The `Approach` and effort estimate of every item are provisional and expire.** They are written from the upstream's
perspective and must be re-verified against the fork's actual current code at execution time, not trusted from the plan.
The fork's structure can invalidate an approach that reads as trivial. Real example (2026-06-13): a panel-swap entrance
animation was planned as "1 cheap line", but the fork keeps all panels mounted and toggles `invisible
pointer-events-none` instead of remounting, so a CSS entrance animation never fires -- the whole approach was moot. When
executing a deferred/EVALUAR item, first confirm the target code still matches what the approach assumes; if not,
re-decide the item rather than forcing the stale plan.

For any item whose recommendation is `evaluar` or that is deferred to a later session, give it an explicit decision
state that gets updated when decided, so a multi-session sync stays auditable:

```
- <commit> <description>: EVALUAR | APLICADO (YYYY-mm-dd, how) | DESCARTADO (YYYY-mm-dd, why) | POSPUESTO (YYYY-mm-dd, blocker)
```

Update the state in place when the item is resolved; do not leave a stale "EVALUAR" once a decision exists.

Use this exact structure:

```markdown
# Upstream sync plan -- YYYY-mm-dd

## Context

Fork: terax-ai (no AI subsystem, enhanced workspace/pane model)
Upstream: https://github.com/crynta/terax-ai.git
Fork philosophy: no AI runtime, no API keys, no keychain; focus on clean fast terminal workspace

Last synced upstream commit: <LAST_SYNC>
Upstream HEAD at plan creation: <UPSTREAM_HEAD>
Commits to process: <count> (<LAST_SYNC>..<UPSTREAM_HEAD>)

## Removed surface (skip all changes to these paths)

[Copy the relevant entries from FORK.md "What has been removed", listing module paths and functional descriptions]

## Ignored changes (Bucket A -- removed surface)

[Functional summary, e.g.]

- Sistema AI (src/modules/ai/): 12 commits, 34 ficheros -- ignorado, es parte de la superficie eliminada
- HTTP proxy / keychain (src-tauri/src/modules/net.rs, secrets.rs): 3 commits -- ignorado

## Changes to apply (Bucket B -- shared code)

For each change:

### [Functional description]

- Files: [list]
- Upstream commits: [sha list]
- Approach: cherry-pick <sha> / manual edit
- Instructions if manual: [exact description of what to do]
- Rationale: [why this is worth merging]

## New features to evaluate (Bucket C)

For each new feature:

### [Feature name]

- Description: [what it does]
- Files: [list]
- Recommendation: add / reject
- Reason: [why]
- Approach if accepted: [git commands or file edits]

## Execution steps

[Ordered list of concrete actions: git commands, file edits, conflict resolutions]
[Each step must be specific enough to execute without further research]

## Quality checks (run after all changes)

```bash
pnpm lint
pnpm check-types
pnpm test
cd src-tauri && cargo clippy && cargo test --locked
```

Fix all errors before proceeding to the documentation step.

## FORK.md updates (always last)

[See "Step 8 -- Update FORK.md" below for what to write. Include the exact text to append/modify here so the executing agent does not need to re-derive it.]

```

---

## Step 8 -- Update FORK.md (always, regardless of path taken)

This step runs whether you did a direct merge (Step 7a) or created a work plan (Step 7b). If a work plan was created, this step's instructions must also be reproduced verbatim inside the plan file so the executing agent can complete them.

**If Bucket C items were explicitly rejected by the user**: add them to `docs/FORK.md` under the relevant "What has been removed" subsection, or create a new subsection if there is no fitting one. Include a note that the feature was evaluated and rejected, not just absent. Example:

```markdown
- `src/modules/new-feature/` -- [Feature name]: evaluated during upstream sync YYYY-mm-dd, rejected because [reason matching fork philosophy]
```

**Always append to `### Upstream sync log`** at the end of `docs/FORK.md`. Create the section if it does not exist.

Exact format for each entry:

```markdown
### Upstream sync log

#### YYYY-mm-dd

- Upstream HEAD: <UPSTREAM_HEAD>
- Commits reviewed: <LAST_SYNC>..<UPSTREAM_HEAD> (<count> commits)
- Outcome: merged directly / work plan created at docs/upstream-YYYY-mm-dd.md
- Changes applied: [brief list, or "none"]
- Changes skipped (removed surface): [brief functional summary]
- New features rejected: [brief list, or "none"]
```

If a work plan was created, the "Outcome" is "work plan created at docs/upstream-YYYY-mm-dd.md" and "Changes applied"
is "none -- pending plan execution". When the plan is later executed by an agent, that agent must update this entry (or
append a sub-entry) to reflect what was actually done.

---

## Edge cases

- **Upstream branch**: always sync from `upstream/main`. If the upstream uses a different default branch, stop and ask
  the user.
- **Commits already in this repo**: `git log LAST_SYNC..upstream/main` naturally excludes them. Do not re-process them.
- **LAST_SYNC not reachable**: if `git log LAST_SYNC..upstream/main` errors because LAST_SYNC is not in the upstream
  history, stop and report. Do not guess a fallback.
- **Empty Buckets B and C**: all upstream changes were in removed surface. Still run Step 8 to record the sync log with
  `UPSTREAM_HEAD`.
- **Partial plan execution**: if a previous work plan was created but not fully executed, check whether the FORK.md sync
  log entry says "pending plan execution". If so, warn the user before running a new analysis -- there may be overlap.

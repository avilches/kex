# Explorer Search: Two-Phase Progressive Results

## Goal

Show file search results immediately from the shallow tree while the full scan continues in the background, giving instant feedback without waiting for the complete traversal.

## Background

`ExplorerSearch` currently makes a single `invoke("fs_search", ...)` call and shows nothing until the full scan completes (up to 50k entries). For large repos this means a blank list for several hundred milliseconds.

The `max_depth` parameter already exists in `fs_search` (added in the previous optimization). No Rust changes are needed.

## Architecture

Two `invoke` calls are launched in parallel immediately after the 300ms debounce:

- **Phase 1 (fast)**: `fs_search({ max_depth: PHASE_1_DEPTH })` -- scans only the shallow tree, returns in ~5-20ms for typical projects.
- **Phase 2 (deep)**: `fs_search({ max_depth: 8 })` -- full scan, same behavior as today.

Both calls share the same `alive` flag and debounce timer. If the query changes, both are cancelled.

`PHASE_1_DEPTH = 3` covers the workspace root and two levels of subdirectories (e.g. `src/modules/`), where most source files live.

## Search Phase State

Replace the boolean `searching` with a `SearchPhase` enum that drives the spinner text:

```typescript
type SearchPhase = "idle" | "phase1" | "phase2" | "done";
```

| Phase | Condition | Spinner text |
|-------|-----------|--------------|
| `idle` | No active query | -- |
| `phase1` | Both calls in flight, no results yet | `"Searching…"` |
| `phase2` | Phase 1 done (results shown), phase 2 in flight | `"Searching deeper…"` |
| `done` | Phase 2 complete | -- |

Special case: if phase 1 returns zero hits, stay in `phase1` state (do not show "No matches" yet -- wait for phase 2 to confirm).

## Result Merge and Selection Preservation

When phase 2 arrives, the list is replaced with the full ranked results. To avoid losing the user's keyboard position:

- Track `selectedPath: string | null` alongside `selectedIndex`.
- `selectedPath` is updated whenever `selectedIndex` changes (keyboard nav, mouse hover, or phase 1 result set).
- On phase 2 arrival:
  1. Replace `results` with `phase2.hits`.
  2. Find `selectedPath` in the new results.
  3. If found: set `selectedIndex` to that position.
  4. If not found (item dropped out of top-200 in full ranking): reset to `0`.

## Data Flow

```
query changes
  → debounce 300ms
    → setPhase("phase1")
    → launch fastSearch (max_depth=3) and deepSearch (max_depth=8) in parallel

fastSearch resolves:
  → if hits.length > 0: setResults(hits), setPhase("phase2")
  → if hits.length == 0: stay in phase1 (wait for deep)

deepSearch resolves:
  → setResults(hits), preserveSelection(), setPhase("done")
  → setTruncated(res.truncated)

query changes again (while searches in flight):
  → alive = false (discards both in-flight responses)
  → clearTimeout(debounce)
  → restart from top
```

## Component Changes

Only `src/modules/explorer/ExplorerSearch.tsx` is modified:

1. Add constant `PHASE_1_DEPTH = 3`.
2. Replace `searching: boolean` state with `phase: SearchPhase`.
3. Add `selectedPath: string | null` state.
4. Update the search `useEffect` to launch two parallel calls.
5. Update keyboard/mouse nav handlers to maintain `selectedPath`.
6. Update the spinner render to show `"Searching…"` or `"Searching deeper…"` based on phase.

## Constraints

- No changes to Rust backend.
- No changes to the IPC interface -- `max_depth` is already an optional parameter.
- `alive` flag behavior unchanged: stale responses from both phases are discarded.
- Generation counter in Rust cancels the old deep scan server-side when a new query arrives (already in place from previous change).
- `pnpm lint`, `pnpm check-types`, `pnpm test` must pass.

## Non-Goals

- True Tauri Channel streaming (deferred -- adds complexity without proportional UX gain given the two-phase approach covers the main case).
- Passing the terminal's current CWD as the phase-1 root (the search is always scoped to workspace root).
- Adjusting `PHASE_1_DEPTH` based on repo size (constant is sufficient).

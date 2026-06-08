# Design: Remove AI subsystem from Terax

**Date:** 2026-06-08
**Status:** Approved

## Goal

Strip the entire AI chat/agent subsystem from Terax, leaving a clean terminal emulator with file explorer, code editor, and git tooling. The only AI-adjacent feature that survives is the passive agent notification system (notification bell + OS notifications) for Claude Code and other coding agents running in terminal tabs.

## What stays

- Terminal (PTY, tabs, split panes, OSC shell integration)
- Code editor (CodeMirror 6, all themes, vim mode)
- File explorer (tree, fuzzy search, icons, inline rename)
- Source control panel (git stage/commit/push/diff)
- Git history pane
- Web preview pane
- Command palette
- Settings window (General, Themes, Shortcuts, About — AI and Agents sections removed)
- Notification bell in header (agent state: working/attention/done)
- OS notifications for agent state transitions
- Rust: `pty/agent_detect.rs` (OSC 777/133 detector in PTY byte reader)
- Rust: `modules/agent.rs` (Claude Code hooks installer — useful for manual `claude` runs in terminal)
- `src/modules/agents/store/agentStore.ts` (terminal agent sessions state)
- `src/modules/agents/components/NotificationBell.tsx`
- `src/modules/agents/lib/route.ts`, `notify.ts`, `agentIcon.tsx`

## What goes

**Frontend:**
- `src/modules/ai/` — entire directory (agent, sessions, composer, tools, stores, slash commands, voice input, autocomplete)
- `src/modules/agents/store/managedAgentsStore.ts` (managed agents via /claude-code)
- AI and Agents sections in `src/settings/`
- AI autocomplete extension in `src/modules/editor/`
- `AiComposerProvider`, `AgentRunBridge`, `useAiLiveBridge`, `hydrateSessions` wires in `App.tsx`

**Rust:**
- `src-tauri/src/modules/net.rs` (AI HTTP proxy — exists only for AI calls)
- `src-tauri/src/modules/secrets.rs` (OS keychain — exists only for API key storage)
- All related `tauri::generate_handler![]` entries in `lib.rs`
- Corresponding entries in `src-tauri/capabilities/default.json`

**Dependencies (npm):**
- `ai` (Vercel AI SDK v6)
- `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/cerebras`, `@ai-sdk/groq`, `@ai-sdk/xai`, `@ai-sdk/react`
- `streamdown`
- Any other packages exclusively imported by the AI module (verify with `pnpm check-types` after deletion)

## Approach: progressive layer removal

Each layer must leave the project compiling, linting clean, and tests passing before moving to the next.

### Layer 1: Remove UI entry points

Remove the AI panel from the sidebar activity bar and `AiInputBar` from the workspace surface. The `src/modules/ai/` code still exists but nothing mounts it. Visually the app looks like the target state.

Validation: `pnpm lint && pnpm check-types && pnpm test` pass. App launches, terminals work.

### Layer 2: Clean up settings window

Remove the AI and Agents sections from `src/settings/`. No provider config, no key management, no agent configuration.

Validation: same checks. Settings window opens without errors.

### Layer 3: Delete `src/modules/ai/` and partial `src/modules/agents/`

With entry points gone, `pnpm check-types` surfaces every remaining consumer. Fix each one, then delete the directory. Remove `managedAgentsStore.ts` from `src/modules/agents/`.

Validation: `pnpm check-types` produces zero errors related to deleted modules.

### Layer 4: Clean up `App.tsx`

Remove `AiComposerProvider` wrapper, `AgentRunBridge`, `useAiLiveBridge` registration, and `hydrateSessions` call. The `AiComposerProvider` removal is safe because no remaining component calls `useComposer()` after layer 3.

Validation: app launches, PTYs spawn correctly, no React context errors.

### Layer 5: Remove editor AI autocomplete

Delete the AI autocomplete CodeMirror extension from `src/modules/editor/`. The editor continues to function with all other features intact.

Validation: editor opens files, syntax highlighting and vim mode work.

### Layer 6: Remove npm dependencies

Delete all `@ai-sdk/*` packages, `ai`, `streamdown`, and any other packages exclusively used by the deleted modules. Update `package.json` and `pnpm-lock.yaml`.

Validation: `pnpm install && pnpm lint && pnpm check-types && pnpm test` all pass. No orphan imports.

### Layer 7: Remove Rust modules

Delete `net.rs` and `secrets.rs`. Remove their `mod` declarations, all `tauri::generate_handler![]` entries, `.plugin(...)` calls in `lib.rs` `run()`, and capability entries in `capabilities/default.json`.

Validation: `cargo clippy --all-targets --locked -D warnings && cargo test --locked` pass.

## Bundle size impact

Removing all AI SDK provider chunks (`ai-anthropic`, `ai-google`, `ai-openai`, `ai-cerebras`, `ai-groq`, `ai-xai`, `ai-openai-compat`, `ai-sdk-shared`, `streamdown`) is expected to reduce the frontend bundle by roughly half. The Rust binary shrinks modestly with `net.rs` and `secrets.rs` gone (removes `reqwest` and `keyring` dependencies if no other crate uses them).

## Validation at completion

```bash
pnpm lint
pnpm check-types
pnpm test
cd src-tauri && cargo clippy --all-targets --locked -D warnings
cd src-tauri && cargo test --locked
```

Manual checks:
- Terminal tab opens and PTY works
- File explorer follows active terminal cwd
- Editor opens and saves files
- Source control panel shows git status
- Git history pane renders commit graph
- Settings window opens all remaining sections without errors
- NotificationBell renders in header
- Running `claude` in a terminal tab triggers the notification bell state transitions

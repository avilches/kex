# Roadmap

Kex direction, what's shipped, what's coming, and what's deliberately out of scope.

This file is updated as direction evolves. For day-to-day work, see [GitHub Issues](https://github.com/avilches/kex/issues).

## What Kex is

Kex is a fast, lightweight terminal emulator. It pairs a native PTY backend with a modern UI: workspace/pane layout, per-pane tab strips, an integrated code editor, a file explorer, source control with a git graph, and passive coding-agent notifications. About 7-8 MB on disk. No telemetry. No account. No AI subsystem.

Fork of [crynta/terax-ai](https://github.com/crynta/terax-ai). The AI chat/agent subsystem was removed entirely. What remains is a lean, high-quality terminal workspace.

## What Kex is not

- Not an AI-native terminal. The AI subsystem (chat, autocomplete, tools, voice) was deliberately removed.
- Not a full IDE replacement. Heavy IDE features that overlap with VS Code / Cursor / Zed are out of scope.
- Not a browser. Web preview exists for local dev servers and lightweight doc viewing only.
- Not a general workspace. Tools and formats that pull the product away from the terminal-first surface are out of scope.

## Themes

1. **Lightweight always.** 7-8 MB binary. Every dependency justified. Per-tab memory budget enforced.
2. **Terminal-first.** xterm.js correctness, PTY fidelity, TUI app compatibility are non-negotiable.
3. **Cross-platform parity.** macOS, Linux, Windows, WSL. No platform-specific exclusives.
4. **Security by default.** Path guards, IPC sandboxing. Defaults safe out of the box.

## Shipped

### Terminal

- [x] Multi-pane workspace layout with WebGL renderer
- [x] Native PTY backend (zsh, bash, pwsh, fish, cmd)
- [x] Workspace sidebar + binary split-pane layout
- [x] Split panes (horizontal and vertical), persistent layout
- [x] Shell integration (cwd, prompt markers via OSC 7 / OSC 133)
- [x] Inline search, link detection, true-color
- [x] WSL bridge as workspace environment
- [x] Agent session restore (Claude Code sessions survive Kex restart)

### Editor

- [x] CodeMirror 6, multi-language (TS/JS, Rust, Python, HTML/CSS, JSON, Markdown, Go, C/C++/Java)
- [x] Vim mode
- [x] Ten built-in editor themes

### File Explorer

- [x] Icon theme with full file-type coverage
- [x] Fuzzy search, keyboard navigation, inline rename, context actions
- [x] Drag files to terminal or editor tabs

### Git / Source Control

- [x] Source control panel (stage, commit, push)
- [x] Git history with commit graph
- [x] Per-file diffs

### Coding Agent Notifications

- [x] Passive detection of Claude Code (and compatible agents) via OSC sequences
- [x] Notification bell: working / needs attention / done
- [x] OS notifications when unfocused; in-app toasts when focused
- [x] Agent session restore on Kex restart

### Web Preview

- [x] Auto-detected local dev server preview
- [x] Image and PDF viewers
- [x] Sandboxed iframe

### Platform

- [x] macOS, Linux (.deb / .rpm / AppImage), Windows (NSIS), WSL
- [x] Auto-updater (signed releases)
- [x] No telemetry

## Planned

- [ ] SSH support (PTY auth and known_hosts first)
- [ ] Inline terminal auto-suggestions (history-based)
- [ ] Tab rename improvements
- [ ] Bundle optimization (lazy-load language packs, tree-shake)
- [ ] Test coverage expansion (PTY edge cases, security functions)

## Out of scope

- **AI chat, tools, autocomplete, voice.** This fork deliberately removes all of it.
- **Heavy IDE features.** Full language-server integration, integrated debuggers, refactoring engines.
- **Notebook and document workspaces.**
- **Full web browser features.** Preview pane stays scoped to local dev servers and lightweight doc viewing.
- **Telemetry, analytics, accounts.**
- **Third-party subscription session bridges.**

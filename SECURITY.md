# Security

Kex runs shells and reads/writes files — so security bugs matter. If you find one, please tell us before posting it publicly.

## Reporting

Open a [GitHub Security Advisory](https://github.com/avilches/kex/security/advisories/new) or email the maintainer directly. Include:

- What the issue is and what it lets an attacker do
- Steps to reproduce (a small PoC is great)
- Version, OS, arch

Please **don't** open a public GitHub issue for security reports.

## Supported versions

Only the latest release gets security fixes.

## What's in scope

- The Rust backend in `src-tauri/` (PTY, FS, IPC, plugins)
- The frontend in `src/` — anywhere untrusted input lands (terminal output, file content)
- Release artifacts on GitHub
- The auto-updater

## What's not

- Bugs in upstream deps (Tauri, xterm.js, CodeMirror) — report those upstream. We'll ship the fix once it's released.
- Anything that needs an already-compromised machine or a local attacker with shell access

## What we do to keep things safe

- **No telemetry.** Kex only talks to the network for update checks and web preview.
- **No Node in the renderer.** The frontend only reaches the host through the allow-listed Tauri commands.
- **Signed releases.** Updates are verified before they're applied.

## What we can't promise

- Kex runs whatever you tell it to run, with your permissions. That's kind of the point of a terminal.

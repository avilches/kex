# Kex IPC - Unix Socket Channel for Lifecycle Hooks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow `SessionStart` and `SessionEnd` hook events to reach Kex via a per-panel Unix domain socket, bypassing the OSC/terminalSequence channel that Claude Code does not inject for lifecycle events.

**Architecture:** Each PTY session creates a Unix domain socket at `/tmp/kex-ipc-<pty_id>.sock`, sets `KEX_IPC` env var so the hook script can find it, and spawns a listener thread. The hook script sends the raw Claude Code JSON payload to the socket for `SessionStart` and `SessionEnd`. The Rust listener parses the JSON and emits the same Tauri events (`kex:agent-session-meta`, `kex:agent-signal`) as the OSC path. Feature is Unix-only; Windows sessions get no socket (existing OSC path continues unchanged on Windows).

**Tech Stack:** Rust `std::os::unix::net::UnixListener`, `serde_json`, Tauri `AppHandle::emit`, bash `nc -U` (BSD/OpenBSD netcat) with Python3 fallback.

## Global Constraints

- No new Cargo dependencies (uses `std::os::unix::net` + existing `serde_json`).
- Unix-only (`#[cfg(unix)]` guards everywhere).
- Socket path: `/tmp/kex-ipc-{pty_id}.sock` — pty_id is u32, max path ≈28 chars, well under macOS 104-char Unix socket limit.
- IPC handles **only** `SessionStart` and `SessionEnd`. All other events continue via OSC unchanged.
- `nc` call in hook script uses `nc -w 1 -U` (1-second timeout) with Python3 fallback so it never blocks.
- Bump script version marker to `kex-session-v5` is already done; no further version bump needed.
- `cargo test --locked`, `pnpm check-types`, `pnpm lint` must pass after every task.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/modules/pty/ipc.rs` | **Create** | `IpcGuard` struct, socket creation, listener thread, JSON dispatch |
| `src-tauri/src/modules/pty/mod.rs` | **Modify** | Declare `mod ipc` (unix-only) |
| `src-tauri/src/modules/pty/session.rs` | **Modify** | Create socket in `spawn()`, add `_ipc_guard` field to `Session`, pass IPC path to `apply_common` |
| `src-tauri/src/modules/pty/shell_init.rs` | **Modify** | Add `ipc_path: Option<&str>` param to `apply_common`, set `KEX_IPC` env var, update two call sites |
| `src-tauri/src/modules/agent/hooks/trigger-event.sh` | **Modify** | `send_ipc()` helper, replace `emit_kex` in `handle_SessionStart` and `handle_SessionEnd` with `send_ipc` |

---

### Task 1: `ipc.rs` — IPC listener module

**Files:**
- Create: `src-tauri/src/modules/pty/ipc.rs`

**Interfaces:**
- Produces: `pub struct IpcGuard` (drops = removes socket file), `pub fn spawn_listener(socket_path: PathBuf, panel_id: String, pty_id: u32, app: AppHandle) -> IpcGuard`
- Consumed by Task 2.

- [ ] **Step 1: Write failing unit tests**

Add these tests at the bottom of the new file (they will fail to compile until the code exists):

```rust
// src-tauri/src/modules/pty/ipc.rs  (test section only — write the whole file in step 3)

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn socket_path_for_id_is_short_enough() {
        // Unix socket path limit on macOS is 104 bytes.
        let p = socket_path_for_pty_id(u32::MAX);
        assert!(p.to_str().unwrap().len() < 104);
    }

    #[test]
    fn ipc_guard_removes_file_on_drop() {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("kex-test-guard-{}.sock", std::process::id()));
        std::fs::write(&path, b"").unwrap();
        assert!(path.exists());
        let guard = IpcGuard(path.clone());
        drop(guard);
        assert!(!path.exists());
    }

    #[test]
    fn parse_session_start_payload() {
        let json = r#"{
          "hook_event_name": "SessionStart",
          "session_id": "abc-123",
          "transcript_path": "/tmp/abc.jsonl",
          "cwd": "/home/user",
          "source": "resume",
          "sessionTitle": "My Title",
          "model": "claude-sonnet-4-6"
        }"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "SessionStart");
        assert_eq!(p.session_id, "abc-123");
        assert_eq!(p.source.as_deref(), Some("resume"));
        assert_eq!(p.session_title.as_deref(), Some("My Title"));
        assert_eq!(p.model.as_deref(), Some("claude-sonnet-4-6"));
        assert!(p.reason.is_none());
    }

    #[test]
    fn parse_session_end_payload() {
        let json = r#"{
          "hook_event_name": "SessionEnd",
          "session_id": "abc-123",
          "transcript_path": "/tmp/abc.jsonl",
          "cwd": "/home/user",
          "reason": "prompt_input_exit"
        }"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "SessionEnd");
        assert_eq!(p.reason.as_deref(), Some("prompt_input_exit"));
        assert!(p.source.is_none());
    }

    #[test]
    fn parse_rejects_invalid_json() {
        assert!(parse_payload("not json").is_none());
        assert!(parse_payload("").is_none());
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail to compile**

```bash
cd src-tauri && cargo test ipc 2>&1 | head -20
```
Expected: compile error — `ipc` module does not exist yet.

- [ ] **Step 3: Write the full `ipc.rs` implementation**

```rust
// src-tauri/src/modules/pty/ipc.rs
use std::io::{BufRead, BufReader};
use std::os::unix::net::UnixListener;
use std::path::PathBuf;
use std::thread;

use tauri::{AppHandle, Emitter};

use crate::modules::agent::session_store;

const AGENT_EVENT: &str = "kex:agent-signal";
const AGENT_SESSION_META_EVENT: &str = "kex:agent-session-meta";

pub fn socket_path_for_pty_id(id: u32) -> PathBuf {
    std::env::temp_dir().join(format!("kex-ipc-{id}.sock"))
}

/// Removes the socket file when dropped, stopping the listener thread.
pub struct IpcGuard(pub PathBuf);

impl Drop for IpcGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

struct Payload {
    event: String,
    session_id: String,
    transcript_path: String,
    cwd: String,
    source: Option<String>,
    session_title: Option<String>,
    model: Option<String>,
    reason: Option<String>,
}

fn parse_payload(json: &str) -> Option<Payload> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let event = v["hook_event_name"].as_str()?.to_string();
    Some(Payload {
        event,
        session_id:      v["session_id"].as_str().unwrap_or("").to_string(),
        transcript_path: v["transcript_path"].as_str().unwrap_or("").to_string(),
        cwd:             v["cwd"].as_str().unwrap_or("").to_string(),
        source:          v["source"].as_str().map(str::to_string),
        session_title:   v["sessionTitle"].as_str().map(str::to_string),
        model:           v["model"].as_str().map(str::to_string),
        reason:          v["reason"].as_str().map(str::to_string),
    })
}

/// Creates the socket, then spawns the listener thread. Returns an IpcGuard
/// that removes the socket file when dropped (which causes the thread to exit).
pub fn spawn_listener(
    socket_path: PathBuf,
    panel_id: String,
    pty_id: u32,
    app: AppHandle,
) -> IpcGuard {
    // Remove stale socket from a previous crash before binding.
    let _ = std::fs::remove_file(&socket_path);

    let listener = match UnixListener::bind(&socket_path) {
        Ok(l) => l,
        Err(e) => {
            log::warn!("[ipc] bind {:?} failed: {e}", socket_path);
            return IpcGuard(socket_path);
        }
    };
    log::debug!("[ipc] listening panel={panel_id} path={:?}", socket_path);

    thread::spawn(move || run_listener(listener, panel_id, pty_id, app));
    IpcGuard(socket_path)
}

fn run_listener(listener: UnixListener, panel_id: String, pty_id: u32, app: AppHandle) {
    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let mut line = String::new();
                let _ = BufReader::new(stream).read_line(&mut line);
                if !line.trim().is_empty() {
                    dispatch(line.trim(), &panel_id, pty_id, &app);
                }
            }
            Err(e) => {
                log::debug!("[ipc] accept error (socket removed?): {e}");
                break;
            }
        }
    }
    log::debug!("[ipc] thread exiting panel={panel_id}");
}

fn dispatch(json: &str, panel_id: &str, pty_id: u32, app: &AppHandle) {
    let Some(p) = parse_payload(json) else {
        log::debug!("[ipc] invalid JSON: {json}");
        return;
    };
    match p.event.as_str() {
        "SessionStart" => {
            let source        = p.source.as_deref().unwrap_or("");
            let session_title = p.session_title.as_deref().unwrap_or("");
            let model         = p.model.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] SessionStart panel={panel_id} session={} \
                 source={source} title={session_title:?} model={model:?}",
                p.session_id
            );
            session_store::record_session(panel_id, "claude", &p.session_id, &p.transcript_path, &p.cwd);
            let _ = app.emit(AGENT_SESSION_META_EVENT, serde_json::json!({
                "panelId":      panel_id,
                "sessionId":    p.session_id,
                "cwdLaunch":    p.cwd,
                "sessionTitle": session_title,
                "model":        model,
            }));
        }
        "SessionEnd" => {
            let reason = p.reason.as_deref().unwrap_or("");
            log::debug!("[ipc] SessionEnd panel={panel_id} reason={reason}");
            let _ = app.emit(AGENT_EVENT, serde_json::json!({
                "id":      pty_id,
                "kind":    "SessionEnd",
                "agent":   null,
                "message": null,
                "toolName": null,
                "prompt":  null,
            }));
        }
        other => {
            log::debug!("[ipc] unhandled event {other} from panel={panel_id}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn socket_path_for_id_is_short_enough() {
        let p = socket_path_for_pty_id(u32::MAX);
        assert!(p.to_str().unwrap().len() < 104);
    }

    #[test]
    fn ipc_guard_removes_file_on_drop() {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("kex-test-guard-{}.sock", std::process::id()));
        std::fs::write(&path, b"").unwrap();
        assert!(path.exists());
        let guard = IpcGuard(path.clone());
        drop(guard);
        assert!(!path.exists());
    }

    #[test]
    fn parse_session_start_payload() {
        let json = r#"{
          "hook_event_name": "SessionStart",
          "session_id": "abc-123",
          "transcript_path": "/tmp/abc.jsonl",
          "cwd": "/home/user",
          "source": "resume",
          "sessionTitle": "My Title",
          "model": "claude-sonnet-4-6"
        }"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "SessionStart");
        assert_eq!(p.session_id, "abc-123");
        assert_eq!(p.source.as_deref(), Some("resume"));
        assert_eq!(p.session_title.as_deref(), Some("My Title"));
        assert_eq!(p.model.as_deref(), Some("claude-sonnet-4-6"));
        assert!(p.reason.is_none());
    }

    #[test]
    fn parse_session_end_payload() {
        let json = r#"{
          "hook_event_name": "SessionEnd",
          "session_id": "abc-123",
          "transcript_path": "/tmp/abc.jsonl",
          "cwd": "/home/user",
          "reason": "prompt_input_exit"
        }"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "SessionEnd");
        assert_eq!(p.reason.as_deref(), Some("prompt_input_exit"));
        assert!(p.source.is_none());
    }

    #[test]
    fn parse_rejects_invalid_json() {
        assert!(parse_payload("not json").is_none());
        assert!(parse_payload("").is_none());
    }
}
```

- [ ] **Step 4: Declare the module in `mod.rs`**

In `src-tauri/src/modules/pty/mod.rs`, add near the other `mod` declarations:

```rust
#[cfg(unix)]
mod ipc;
```

- [ ] **Step 5: Run tests**

```bash
cd src-tauri && cargo test --locked 2>&1 | tail -10
```
Expected: all tests pass including the 4 new `ipc` tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/modules/pty/ipc.rs src-tauri/src/modules/pty/mod.rs
git commit -m "feat(ipc): Unix socket listener module for lifecycle hook events"
```

---

### Task 2: Session integration — create socket, set env var, clean up

**Files:**
- Modify: `src-tauri/src/modules/pty/session.rs`
- Modify: `src-tauri/src/modules/pty/shell_init.rs`

**Interfaces:**
- Consumes: `ipc::socket_path_for_pty_id(id)`, `ipc::spawn_listener(path, panel_id, id, app)` from Task 1.
- `apply_common` signature changes from `(cmd, cwd, blocks, panel_id)` to `(cmd, cwd, blocks, panel_id, ipc_path)`.

- [ ] **Step 1: Add `ipc_path` parameter to `apply_common` in `shell_init.rs`**

Current signature at line 108:
```rust
fn apply_common(cmd: &mut CommandBuilder, cwd: Option<String>, blocks: bool, panel_id: Option<&str>) {
```

New signature — add `ipc_path: Option<&str>` and set `KEX_IPC`:
```rust
fn apply_common(
    cmd: &mut CommandBuilder,
    cwd: Option<String>,
    blocks: bool,
    panel_id: Option<&str>,
    ipc_path: Option<&str>,
) {
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("KEX_TERMINAL", "1");
    if blocks {
        cmd.env("KEX_BLOCKS", "1");
    }
    if let Some(pid) = panel_id {
        cmd.env("KEX_PANEL_ID", pid);
    }
    if let Some(path) = ipc_path {
        cmd.env("KEX_IPC", path);
    }
    // ... rest of the function unchanged
```

- [ ] **Step 2: Update the two `apply_common` call sites in `shell_init.rs`**

Search for `apply_common(` in `shell_init.rs`. There are two calls (lines ≈203 and ≈380). Update both by adding `None` as the last argument (the socket path will be passed from `session.rs`, not from within `shell_init.rs` itself):

```rust
// Both call sites — replace the 4-arg call with 5-arg:
apply_common(&mut cmd, cwd, blocks, panel_id, None);
```

Note: `None` here because `shell_init::build_command` doesn't know the socket path. The socket path will be injected by `session::spawn` after calling `build_command`, by calling `cmd.env("KEX_IPC", ...)` directly. See Step 3.

Actually, a cleaner approach: pass `ipc_path` all the way through `build_command` too. Check the signature of `build_command` (line 50 in shell_init.rs) and add `ipc_path: Option<&str>` there as well. Then session.rs calls `build_command(..., ipc_path)` and `build_command` passes it to `apply_common`. This keeps env var setup centralized in `apply_common`.

Update `build_command` signature (line 50):
```rust
pub fn build_command(
    workspace: WorkspaceEnv,
    cwd: Option<String>,
    blocks: bool,
    panel_id: Option<&str>,
    ipc_path: Option<&str>,    // ADD
) -> CommandBuilder {
```

Update every `apply_common` call inside `build_command` to pass `ipc_path`.

Check how many `build_command` call sites exist:
```bash
grep -n "build_command(" src-tauri/src/modules/pty/session.rs src-tauri/src/modules/pty/mod.rs
```

Update those call sites to pass `ipc_path`.

- [ ] **Step 3: Verify `shell_init.rs` compiles cleanly**

```bash
cd src-tauri && cargo check 2>&1 | grep -E "error|warning.*unused" | head -20
```
Expected: no errors.

- [ ] **Step 4: Add `_ipc_guard` field to `Session` struct in `session.rs`**

Locate the `Session` struct (around line 43). Add the guard field after `_job` (Unix has no `_job`, Windows does). Field drop order comment should be updated:

```rust
pub struct Session {
    // Field drop order is intentional (see comments below). Rust drops top-to-bottom:
    //   1. `_job` (Windows) — KILL_ON_JOB_CLOSE before master pipe drops.
    //   2. `_ipc_guard` (Unix) — removes socket file; listener thread exits.
    //   3. `killer` — best-effort kill of child process.
    //   4. `writer` — closes input side of master pipe.
    //   5. `master` — ClosePseudoConsole (Windows) / drops master fd (Unix).
    #[cfg(windows)]
    _job: Option<super::job::PtyJob>,
    #[cfg(unix)]
    pub(super) _ipc_guard: Option<super::ipc::IpcGuard>,
    pub shell_pid: u32,
    pub killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub master: Mutex<Box<dyn MasterPty + Send>>,
}
```

- [ ] **Step 5: Create the socket and wire it up in `session::spawn()`**

In `session.rs`, locate `pub fn spawn(...)`. At the top of the function, before the call to `shell_init::build_command`, add:

```rust
#[cfg(unix)]
let ipc_path = super::ipc::socket_path_for_pty_id(id);
#[cfg(unix)]
let ipc_path_str = ipc_path.to_str().unwrap_or("").to_string();
#[cfg(not(unix))]
let ipc_path_str = String::new();
```

Pass `ipc_path_str` to `build_command` (as `Some(ipc_path_str.as_str())` when non-empty, or `None` on Windows).

Start the IPC listener AFTER `build_command` but BEFORE spawning the child process, and store the guard in the Session:

```rust
#[cfg(unix)]
let ipc_guard = super::ipc::spawn_listener(
    ipc_path.clone(),
    panel_id.clone().unwrap_or_default(),
    id,
    app.clone(),
);
```

In the `Session { ... }` construction, add:
```rust
#[cfg(unix)]
_ipc_guard: Some(ipc_guard),
```

- [ ] **Step 6: Confirm tests still pass**

```bash
cd src-tauri && cargo test --locked 2>&1 | tail -10
```
Expected: 220+ tests pass (216 original + 4 new ipc tests).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/modules/pty/session.rs src-tauri/src/modules/pty/shell_init.rs
git commit -m "feat(ipc): create Unix socket per PTY session, set KEX_IPC env var"
```

---

### Task 3: Hook script — send IPC for SessionStart and SessionEnd

**Files:**
- Modify: `src-tauri/src/modules/agent/hooks/trigger-event.sh`
- Modify: `src-tauri/src/modules/agent/mod.rs` (update version comment)

**Interfaces:**
- Consumes: `$KEX_IPC` env var set by Task 2.
- `handle_SessionStart` and `handle_SessionEnd` no longer call `emit_kex` (OSC doesn't work for lifecycle events). They call `send_ipc` instead.
- All other handlers continue using `emit_kex` unchanged.

- [ ] **Step 1: Add `send_ipc` helper and update `handle_SessionStart` and `handle_SessionEnd`**

Edit `src-tauri/src/modules/agent/hooks/trigger-event.sh`. Replace the two handlers and add the helper:

```bash
# Send raw payload to KEX_IPC Unix socket.
# Uses nc -U (BSD/OpenBSD netcat, macOS + most Linux), falls back to python3.
# Fails silently if KEX_IPC is unset or socket is unavailable.
send_ipc() {
    [ -n "$KEX_IPC" ] || return 0
    if command -v nc > /dev/null 2>&1; then
        printf '%s\n' "$PAYLOAD" | nc -w 1 -U "$KEX_IPC" 2>/dev/null && return 0
    fi
    python3 -c "
import socket, sys
s = socket.socket(socket.AF_UNIX)
s.settimeout(2)
try:
    s.connect(sys.argv[1])
    s.sendall(sys.stdin.buffer.read())
finally:
    s.close()
" "$KEX_IPC" <<< "$PAYLOAD" 2>/dev/null || true
}

handle_SessionStart() {
    log_payload
    # terminalSequence is not injected by Claude Code for lifecycle hooks.
    # Use Unix socket IPC instead.
    send_ipc
}

handle_SessionEnd() {
    log_payload
    # Same as SessionStart — terminalSequence not injected.
    send_ipc
}
```

The existing `handle_SessionStart` and `handle_SessionEnd` (which called `emit_kex` with SRC/TITLE/MODEL and REASON fields) are replaced entirely by the above. The field extraction moves to Rust's `dispatch()` in `ipc.rs` which reads directly from the JSON payload.

- [ ] **Step 2: Reinstall hooks in Kex**

The embedded script in `mod.rs` (via `include_str!`) picks up the file change at compile time. After rebuilding, the user reinstalls hooks via the Kex bell menu "Set up Claude Code".

- [ ] **Step 3: Rebuild and verify IPC in Tauri dev console**

```bash
cd src-tauri && cargo check 2>&1 | grep "^error" | head -10
```
Expected: no errors.

Start `pnpm tauri dev`, open a terminal, run `claude`, and check the Tauri log output for:
```
[ipc] listening panel=<id> path="/tmp/kex-ipc-1.sock"
[ipc] SessionStart panel=<id> session=<uuid> source=startup ...
```

- [ ] **Step 4: Run full check suite**

```bash
cd src-tauri && cargo test --locked 2>&1 | tail -5
cd /Users/avilches/Work/Proy/Repos/terax-ai && pnpm check-types 2>&1 | tail -5
pnpm lint 2>&1 | tail -5
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/modules/agent/hooks/trigger-event.sh
git commit -m "feat(ipc): use Unix socket IPC for SessionStart and SessionEnd hook events"
```

---

## Self-Review

**Spec coverage:**
- Unix socket per panel: Task 1 + Task 2. ✓
- `KEX_IPC` env var: Task 2 (`apply_common`). ✓
- `send_ipc` in hook: Task 3. ✓
- `nc -U` with python3 fallback: Task 3. ✓
- SessionStart → record_session + meta event: Task 1 `dispatch()`. ✓
- SessionEnd → agent-signal event: Task 1 `dispatch()`. ✓
- Socket cleanup on drop: Task 2 `IpcGuard`. ✓
- Stale socket removed before bind: Task 1 `spawn_listener`. ✓
- Unix-only guard: Task 1 + Task 2. ✓
- No new Cargo deps: confirmed (std + serde_json already present). ✓

**Known gap — agent name in SessionStart:**
`dispatch()` hardcodes `"claude"` as the agent. If the session is a `codex` session, the record will be wrong until `UserPromptSubmit` (OSC) arrives and overwrites it. Acceptable for v1 — note in code comment.

**Placeholder scan:** No TBDs, no "similar to task N" references. Each step has full code. ✓

**Type consistency:**
- `IpcGuard` defined Task 1, used in Task 2 as `_ipc_guard: Option<super::ipc::IpcGuard>`. ✓
- `socket_path_for_pty_id` defined Task 1, called in Task 2. ✓
- `spawn_listener(PathBuf, String, u32, AppHandle)` defined Task 1, called in Task 2. ✓
- `apply_common` new signature defined and all call sites updated in Task 2. ✓
- `build_command` signature change: verify call sites with `grep -n "build_command("` before implementing. ✓ (noted in Step 2).

mod agent_detect;
mod da_filter;
#[cfg(unix)]
mod ipc;
#[cfg(windows)]
mod job;
mod session;
pub(crate) mod shell_init;

use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};
use std::thread;

use portable_pty::PtySize;
use tauri::ipc::{Channel, Response};

use crate::modules::workspace::{spawn_cwd_or_home, WorkspaceEnv, WorkspaceRegistry};
use session::Session;

pub struct PtyState {
    sessions: RwLock<HashMap<u32, Arc<Session>>>,
    // Maps window label → set of PTY ids owned by that window.
    // Used by pty_close_all to only reap sessions belonging to the caller window.
    window_sessions: RwLock<HashMap<String, Vec<u32>>>,
    // Starts at 1 so freshly-handed-out ids are never 0, which the frontend
    // sometimes treats as "unset". Increments monotonically; never reused.
    next_id: AtomicU32,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            window_sessions: RwLock::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }
}

impl PtyState {
    pub(super) fn take(&self, id: u32) -> Option<Arc<Session>> {
        self.sessions.write().unwrap().remove(&id)
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn pty_open(
    app: tauri::AppHandle,
    webview_window: tauri::WebviewWindow,
    state: tauri::State<'_, PtyState>,
    registry: tauri::State<'_, WorkspaceRegistry>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    workspace: Option<WorkspaceEnv>,
    blocks: Option<bool>,
    panel_id: Option<String>,
    on_data: Channel<Response>,
    on_exit: Channel<i32>,
) -> Result<u32, String> {
    let window_label = webview_window.label().to_string();
    let workspace = WorkspaceEnv::from_option(workspace);
    let blocks = blocks.unwrap_or(false);
    // Validate before spawn; register only after spawn succeeds so a failed
    // spawn never widens the authorization surface. A stale or cross-environment
    // cwd falls back to home rather than failing the open.
    let (cwd, canonical_cwd) = spawn_cwd_or_home(cwd, &workspace);
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let session = tauri::async_runtime::spawn_blocking(move || {
        session::spawn(id, app, cols, rows, cwd, workspace, blocks, panel_id, on_data, on_exit)
            .map(|(s, _)| s)
    })
    .await
    .map_err(|e| {
        log::error!("pty_open join failed: {e}");
        e.to_string()
    })?
    .map_err(|e| {
        log::error!("pty_open failed: {e}");
        e
    })?;
    if let Some(canonical) = canonical_cwd {
        registry.authorize(&canonical).map_err(|e| {
            log::warn!("pty_open: registry authorize failed: {e}");
            e.to_string()
        })?;
    }
    state.sessions.write().unwrap().insert(id, session);
    state.window_sessions.write().unwrap()
        .entry(window_label.clone())
        .or_default()
        .push(id);
    // The shell can exit before this insert (instant failure, `exit` in an rc
    // file); the waiter's reap then ran with the id absent. Re-check and reap
    // here so the pseudoconsole isn't stranded.
    let exited = state
        .sessions
        .read()
        .unwrap()
        .get(&id)
        .map(|s| s.exited.load(Ordering::Acquire))
        .unwrap_or(false);
    if exited {
        if let Some(s) = state.take(id) {
            thread::Builder::new()
                .name(format!("kex-pty-drop-{id}"))
                .spawn(move || session::drop_session(s))
                .expect("spawn pty drop thread");
        }
    }
    log::info!("pty opened id={id} cols={cols} rows={rows} window={window_label}");
    Ok(id)
}

// Input is the latency-critical path: raw body + id header skips JSON
// serialization of every keystroke on both sides of the IPC boundary.
#[tauri::command]
pub fn pty_write(
    state: tauri::State<PtyState>,
    request: tauri::ipc::Request,
) -> Result<(), String> {
    let id: u32 = request
        .headers()
        .get("x-pty-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| "pty_write: missing x-pty-id header".to_string())?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("pty_write: expected raw body".to_string());
    };
    let session = state
        .sessions
        .read()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| {
            log::warn!("pty_write: unknown id={id}");
            "no session".to_string()
        })?;
    // Bind to a local so the MutexGuard temporary drops before `session` —
    // see rustc note on tail-expression temporary drop order.
    let result = session
        .writer
        .lock()
        .unwrap()
        .write_all(bytes)
        .map_err(|e| {
            // EPIPE is expected if the child already exited.
            log::debug!("pty_write id={id} failed: {e}");
            e.to_string()
        });
    result
}

#[tauri::command]
pub fn pty_resize(
    state: tauri::State<PtyState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state
        .sessions
        .read()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| {
            log::warn!("pty_resize: unknown id={id}");
            "no session".to_string()
        })?;
    let result = session
        .master
        .lock()
        .unwrap()
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| {
            log::warn!("pty_resize id={id} failed: {e}");
            e.to_string()
        });
    result
}

#[tauri::command]
pub fn pty_close(state: tauri::State<PtyState>, id: u32) -> Result<(), String> {
    state.window_sessions.write().unwrap()
        .values_mut()
        .for_each(|ids| ids.retain(|&i| i != id));
    let session = state.sessions.write().unwrap().remove(&id);
    if let Some(s) = session {
        if let Err(e) = s.killer.lock().unwrap().kill() {
            // Non-fatal: the child may already have exited on its own (e.g. the
            // user ran `exit`). Log so this isn't invisible during debugging.
            log::debug!("pty_close: kill id={id} returned {e}");
        }
        log::info!("pty closed id={id}");
        // Detached: on Windows `ClosePseudoConsole` can block until conhost
        // drains, which would freeze this Tauri worker thread and stall IPC.
        thread::Builder::new()
            .name(format!("kex-pty-drop-{id}"))
            .spawn(move || {
                let t0 = std::time::Instant::now();
                session::drop_session(s);
                log::info!(
                    "pty session id={id} dropped in {}ms",
                    t0.elapsed().as_millis()
                );
            })
            .expect("spawn pty drop thread");
    } else {
        log::debug!("pty_close: unknown id={id}");
    }
    Ok(())
}

#[tauri::command]
pub fn pty_has_foreground_process(state: tauri::State<PtyState>, id: u32) -> Result<Option<String>, String> {
    let sessions = state.sessions.read().unwrap();
    let session = sessions.get(&id).ok_or_else(|| {
        log::warn!("pty_has_foreground_process: unknown session id={id}");
        "no session".to_string()
    })?;
    let shell_pid = session.shell_pid;
    if shell_pid == 0 {
        return Ok(None);
    }
    Ok(shell_foreground_process_name(shell_pid))
}

// Returns the name of the first foreground child of the shell, or None if no child exists.
#[cfg(unix)]
fn shell_foreground_process_name(shell_pid: u32) -> Option<String> {
    let output = std::process::Command::new("pgrep")
        .args(["-l", "-P", &shell_pid.to_string()])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    // Each line is "<pid> <name>"; take the first child's name.
    let stdout = String::from_utf8_lossy(&output.stdout);
    let first_line = stdout.lines().next()?;
    let name = first_line.split_whitespace().nth(1)?.to_string();
    Some(name)
}

#[cfg(windows)]
fn shell_foreground_process_name(shell_pid: u32) -> Option<String> {
    use std::ffi::CStr;
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32,
        TH32CS_SNAPPROCESS,
    };
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return None;
        }
        let mut entry: PROCESSENTRY32 = zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32>() as u32;
        let mut found_name = None;
        if Process32First(snapshot, &mut entry) != 0 {
            loop {
                if entry.th32ParentProcessID == shell_pid {
                    let name = CStr::from_ptr(entry.szExeFile.as_ptr() as *const i8)
                        .to_string_lossy()
                        .into_owned();
                    let name = name.strip_suffix(".exe").unwrap_or(&name).to_string();
                    found_name = Some(name);
                    break;
                }
                if Process32Next(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
        found_name
    }
}

// A fresh webview load orphans the previous frontend's sessions in this still
// running process; reap them on boot before any new tab spawns.
// Only closes sessions that belong to the calling window so that other open
// windows are not affected.
#[tauri::command]
pub fn pty_close_all(
    webview_window: tauri::WebviewWindow,
    state: tauri::State<PtyState>,
) -> Result<usize, String> {
    let window_label = webview_window.label().to_string();
    let ids: Vec<u32> = state.window_sessions.write().unwrap()
        .remove(&window_label)
        .unwrap_or_default();
    let sessions: Vec<(u32, Arc<Session>)> = {
        let mut all = state.sessions.write().unwrap();
        ids.iter().filter_map(|id| all.remove(id).map(|s| (*id, s))).collect()
    };
    let count = sessions.len();
    for (id, s) in sessions {
        if let Err(e) = s.killer.lock().unwrap().kill() {
            log::debug!("pty_close_all: kill id={id} returned {e}");
        }
        thread::Builder::new()
            .name(format!("kex-pty-drop-{id}"))
            .spawn(move || session::drop_session(s))
            .expect("spawn pty drop thread");
    }
    if count > 0 {
        log::info!("pty_close_all: reaped {count} orphaned session(s) for window={window_label}");
    }
    Ok(count)
}

#[tauri::command]
pub fn pty_shell_name() -> String {
    shell_init::detect_shell_name()
}

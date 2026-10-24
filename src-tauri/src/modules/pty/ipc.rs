#![cfg(unix)]

use std::io::{Read, Write};
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use super::hook_router::{
    frame_origin, is_safe_tab_id, late_frame_is_dropped, route, Route, TabRegistry,
};
use crate::modules::agent::{live_model, session_store};

const AGENT_EVENT: &str = "kex:agent-signal";
const AGENT_SESSION_META_EVENT: &str = "kex:agent-session-meta";
const AGENT_CWD_EVENT: &str = "kex:agent-cwd";

/// Directory that holds this user's IPC sockets.
///
/// The system temp dir is shared and world-writable, so a socket placed
/// directly inside it (the old behaviour) has a predictable path any other
/// local user can pre-create to deny service, or (depending on umask)
/// connect to once bound, to inject forged agent events. Prefer
/// `XDG_RUNTIME_DIR`, which systemd/pam_systemd already creates mode 0700
/// and owned by the user; otherwise fall back to a per-uid subdirectory of
/// the temp dir that Kex creates itself with 0700.
fn runtime_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("XDG_RUNTIME_DIR").map(PathBuf::from) {
        if dir.is_dir() {
            return dir;
        }
    }
    owned_runtime_subdir(&std::env::temp_dir(), unsafe { libc::getuid() })
}

/// Creates (or reuses) a `kex-ipc-<uid>` directory under `base`, restricted
/// to 0700. Split out of `runtime_dir` so tests can point `base` at an
/// isolated temp dir instead of the real, possibly shared, system one.
fn owned_runtime_subdir(base: &std::path::Path, uid: u32) -> PathBuf {
    let dir = base.join(format!("kex-ipc-{uid}"));
    match std::fs::create_dir(&dir) {
        Ok(()) => {
            let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
            dir
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            // Only trust a pre-existing directory if it is actually ours: one
            // pre-created by another local user on a shared machine must not
            // be silently reused.
            match std::fs::metadata(&dir) {
                Ok(meta) if meta.uid() == uid => dir,
                _ => {
                    log::warn!("[ipc] {dir:?} exists but is not owned by this user, falling back to the shared temp dir");
                    base.to_path_buf()
                }
            }
        }
        Err(e) => {
            log::warn!("[ipc] could not create {dir:?}: {e}, falling back to the shared temp dir");
            base.to_path_buf()
        }
    }
}

fn socket_file_name(pid: u32) -> String {
    format!("kex-ipc-{pid}.sock")
}

fn socket_owner_pid(file_name: &str) -> Option<u32> {
    file_name
        .strip_prefix("kex-ipc-")?
        .strip_suffix(".sock")?
        .parse()
        .ok()
}

/// Names in `names` that are sockets of a Kex process that no longer exists.
fn orphaned_sockets(names: &[String], is_alive: impl Fn(u32) -> bool) -> Vec<&str> {
    names
        .iter()
        .filter(|n| socket_owner_pid(n).is_some_and(|pid| !is_alive(pid)))
        .map(String::as_str)
        .collect()
}

fn pid_is_alive(pid: u32) -> bool {
    let Ok(pid) = libc::pid_t::try_from(pid) else {
        return true;
    };
    let rc = unsafe { libc::kill(pid, 0) };
    rc == 0 || std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
}

fn sweep_orphaned_sockets(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let names: Vec<String> = entries
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    for name in orphaned_sockets(&names, pid_is_alive) {
        let _ = std::fs::remove_file(dir.join(name));
    }
}

/// The path embeds this process's pid because several Kex instances (installed and dev) share
/// `runtime_dir()`.
fn socket_path_in(dir: &Path) -> PathBuf {
    dir.join(socket_file_name(std::process::id()))
}

/// Where hook frames end up once the transport has read them. Split from the transport so a
/// test, or another platform's transport, drives the same routing without Tauri.
trait HookSink: Send + Sync {
    fn emit(&self, event: &str, payload: serde_json::Value);
    fn live_model(&self, tab_id: &str, transcript_path: &str);
}

struct AppSink(AppHandle);

impl HookSink for AppSink {
    fn emit(&self, event: &str, payload: serde_json::Value) {
        let _ = self.0.emit(event, payload);
    }

    fn live_model(&self, tab_id: &str, transcript_path: &str) {
        live_model::emit_live_model(&self.0, tab_id, transcript_path);
    }
}

/// Routes every hook frame of the app to its tab. The registry lock is held while a frame is
/// routed and, when it must be, written to the spool, and across the drain that makes a PTY
/// live, so a frame is either spooled before the drain reads the directory or routed live
/// after it: none falls in between. Delivering a live frame happens after the lock is released.
struct HookHub {
    sink: Box<dyn HookSink>,
    spool_base: Option<PathBuf>,
    tabs: Mutex<TabRegistry>,
}

impl HookHub {
    fn new(sink: Box<dyn HookSink>, spool_base: Option<PathBuf>) -> Self {
        Self {
            sink,
            spool_base,
            tabs: Mutex::new(TabRegistry::default()),
        }
    }

    // A panic while handling one frame must not lock every terminal out of the registry.
    fn tabs(&self) -> std::sync::MutexGuard<'_, TabRegistry> {
        self.tabs.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// The whole contract a transport has with the hub: one line is one frame.
    fn handle_line(&self, line: &str) {
        let route = {
            let tabs = self.tabs();
            let route = route(&frame_origin(line), |t| tabs.current(t));
            if let Route::Spool { tab_id } = &route {
                self.spool(line, tab_id);
            }
            route
        };
        match route {
            Route::Live { tab_id, pty_id } => self.dispatch(line, &tab_id, pty_id),
            Route::Late { tab_id, pty_id } => self.late(line, &tab_id, pty_id),
            Route::Spool { .. } => {}
            Route::Reject(why) => {
                log::debug!("[ipc] {why}: {}", truncate_for_log(line, MAX_LOG_FIELD_LEN))
            }
        }
    }

    /// The tab's frames are spooled from now on until `activate`, so a PTY whose spawn fails
    /// never consumes them.
    fn register(&self, tab_id: &str, pty_id: u32) {
        self.tabs().register(tab_id, pty_id);
    }

    /// Makes the PTY live and replays, in order, what the tab spooled while it had none.
    fn activate(&self, tab_id: &str, pty_id: u32) {
        let mut tabs = self.tabs();
        if !tabs.activate(tab_id, pty_id) {
            return;
        }
        if let Some(base) = &self.spool_base {
            drain_spool(base, tab_id, |line| {
                if let Some(kind) = stale_spooled_event_kind(line) {
                    log::debug!("[ipc] discarded spooled {kind} event tab={tab_id}");
                    return;
                }
                self.dispatch(line, tab_id, pty_id);
            });
        }
        log::debug!("[ipc] tab={tab_id} pty={pty_id} live");
    }

    fn unregister(&self, tab_id: &str, pty_id: u32) {
        self.tabs().unregister(tab_id, pty_id);
    }

    fn dispatch(&self, line: &str, tab_id: &str, pty_id: u32) {
        dispatch_with(
            line,
            tab_id,
            pty_id,
            &mut |event, payload| self.sink.emit(event, payload),
            &mut |transcript| self.sink.live_model(tab_id, transcript),
        );
    }

    /// A frame that outlived the PTY that produced it, delivered to the tab's current PTY.
    fn late(&self, line: &str, tab_id: &str, pty_id: u32) {
        let event = parse_payload(line).map(|p| p.event).unwrap_or_default();
        if late_frame_is_dropped(&event) {
            log::debug!("[ipc] discarded late {event} event tab={tab_id}");
            return;
        }
        self.dispatch(line, tab_id, pty_id);
    }

    /// The end-of-session signals are dropped here rather than on the drain: the drain would
    /// discard them anyway, and a closed tab would keep a spool directory just for them.
    fn spool(&self, line: &str, tab_id: &str) {
        if let Some(kind) = stale_spooled_event_kind(line) {
            log::debug!("[ipc] {kind} for tab={tab_id} with no PTY dropped");
            return;
        }
        let Some(base) = &self.spool_base else {
            return;
        };
        if let Err(e) = spool_event(base, tab_id, line) {
            log::warn!("[ipc] failed to spool event for tab={tab_id}: {e}");
        }
    }
}

/// Unregisters the tab's PTY when the PTY session drops. A tab whose PTY restarts registers the
/// new one first, and `TabRegistry::unregister` ignores the stale PTY.
pub struct TabLease {
    hub: &'static HookHub,
    tab_id: String,
    pty_id: u32,
}

impl TabLease {
    /// Called once the PTY's child is running: from here the tab's frames go to this PTY.
    pub fn activate(&self) {
        self.hub.activate(&self.tab_id, self.pty_id);
    }
}

impl Drop for TabLease {
    fn drop(&mut self) {
        self.hub.unregister(&self.tab_id, self.pty_id);
    }
}

const MAX_FRAME_BYTES: usize = 4 * 1024 * 1024;
// One thread serves every tab, so a connection gets this long in total, however it trickles
// its bytes; the frames of the others wait in the socket backlog meanwhile, not lost. A local
// hook writes its whole frame in well under a millisecond.
const FRAME_DEADLINE: Duration = Duration::from_millis(500);

/// The Unix transport: one socket and one accept thread for the life of the app. All it knows
/// about a frame is that it is one line; the hub does the rest.
struct HookServer {
    path: PathBuf,
    shutdown: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}

impl HookServer {
    fn start(path: PathBuf, hub: &'static HookHub) -> std::io::Result<Self> {
        // The pid in the name makes this path ours alone, so only a leftover of ours can be here.
        let _ = std::fs::remove_file(&path);
        let listener = UnixListener::bind(&path)?;
        // bind() honors the umask, which on a shared machine could leave the socket group or
        // world accessible; force owner-only so another local user cannot send forged events.
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
        let shutdown = Arc::new(AtomicBool::new(false));
        let stop = shutdown.clone();
        let thread = thread::Builder::new()
            .name("kex-ipc".into())
            .spawn(move || serve(listener, hub, stop))?;
        log::debug!("[ipc] listening path={path:?}");
        Ok(Self {
            path,
            shutdown,
            thread: Some(thread),
        })
    }
}

impl Drop for HookServer {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::SeqCst);
        // Unlinking does not wake a thread parked in accept(), connecting does, and the loop
        // checks the flag before reading.
        let _ = UnixStream::connect(&self.path);
        let _ = std::fs::remove_file(&self.path);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

fn serve(listener: UnixListener, hub: &'static HookHub, shutdown: Arc<AtomicBool>) {
    let mut failures = 0u32;
    for stream in listener.incoming() {
        if shutdown.load(Ordering::SeqCst) {
            break;
        }
        match stream {
            Ok(stream) => {
                failures = 0;
                if let Some(line) = read_frame(stream, Instant::now() + FRAME_DEADLINE) {
                    handle_guarded(hub, &line);
                }
            }
            Err(e) => {
                failures = failures.saturating_add(1);
                let wait = accept_backoff(failures);
                log::warn!("[ipc] accept failed ({e}), retrying in {wait:?}");
                thread::sleep(wait);
            }
        }
    }
    log::debug!("[ipc] thread exiting");
}

const ACCEPT_BACKOFF_MAX: Duration = Duration::from_secs(1);

/// The wait after the `failures`-th accept error in a row. Every one of them (EMFILE, ENFILE,
/// ECONNABORTED) can clear on its own, and giving up would leave every tab without hooks for
/// the rest of the session, so the loop only ever stops on shutdown.
fn accept_backoff(failures: u32) -> Duration {
    let ms = 10u64.saturating_mul(1u64 << failures.saturating_sub(1).min(16));
    Duration::from_millis(ms).min(ACCEPT_BACKOFF_MAX)
}

/// A panic loses this frame, not the listener every tab depends on.
fn handle_guarded(hub: &HookHub, line: &str) {
    let handled = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| hub.handle_line(line)));
    if handled.is_err() {
        log::error!("[ipc] panic while handling a hook frame, frame dropped");
    }
}

/// One line, read before `deadline`. A frame that is not complete by then, or that outgrows
/// `MAX_FRAME_BYTES`, is dropped; one that ends at EOF without a newline is kept.
fn read_frame(mut stream: UnixStream, deadline: Instant) -> Option<String> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 8192];
    loop {
        let left = deadline.checked_duration_since(Instant::now())?;
        if left.is_zero() {
            return None;
        }
        // macOS answers EINVAL once the peer has closed, and then the read cannot block anyway.
        let _ = stream.set_read_timeout(Some(left));
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                if let Some(end) = chunk[..n].iter().position(|&b| b == b'\n') {
                    buf.extend_from_slice(&chunk[..end]);
                    break;
                }
                buf.extend_from_slice(&chunk[..n]);
                if buf.len() > MAX_FRAME_BYTES {
                    return None;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => return None,
        }
    }
    let line = String::from_utf8(buf).ok()?;
    let line = line.trim();
    (!line.is_empty()).then(|| line.to_string())
}

static HUB: OnceLock<HookHub> = OnceLock::new();
static SERVER: Mutex<Option<HookServer>> = Mutex::new(None);
static SOCKET: OnceLock<PathBuf> = OnceLock::new();

fn hub(app: &AppHandle) -> &'static HookHub {
    HUB.get_or_init(|| HookHub::new(Box::new(AppSink(app.clone())), spool_dir()))
}

/// The app's hook socket, started by the first PTY. A failed bind still returns the path, so
/// the hook script spools what it cannot deliver instead of dropping it, and the next PTY
/// tries the bind again.
pub fn hook_socket(app: &AppHandle) -> PathBuf {
    let path = SOCKET
        .get_or_init(|| {
            let dir = runtime_dir();
            sweep_orphaned_sockets(&dir);
            socket_path_in(&dir)
        })
        .clone();
    let mut server = SERVER.lock().unwrap_or_else(|e| e.into_inner());
    ensure_server(&mut server, &path, |p| {
        HookServer::start(p.to_path_buf(), hub(app))
    });
    path
}

/// Starts the server when none is running. The error is logged as a warning on every failed
/// attempt, so a channel that stays down is visible in the log, not only on the first try.
fn ensure_server<S>(
    slot: &mut Option<S>,
    path: &Path,
    start: impl FnOnce(&Path) -> std::io::Result<S>,
) {
    if slot.is_some() {
        return;
    }
    match start(path) {
        Ok(server) => *slot = Some(server),
        Err(e) => log::warn!(
            "[ipc] hook server on {path:?} failed: {e}; agent hooks are spooled until a later terminal binds it"
        ),
    }
}

/// Claims `tab_id` for `pty_id`, pending until `TabLease::activate`. `None` for a tab id that
/// could not name a spool directory.
pub fn register_tab(app: &AppHandle, tab_id: &str, pty_id: u32) -> Option<TabLease> {
    if !is_safe_tab_id(tab_id) {
        log::warn!("[ipc] not registering unsafe tab id {tab_id:?}");
        return None;
    }
    let hub = hub(app);
    hub.register(tab_id, pty_id);
    Some(TabLease {
        hub,
        tab_id: tab_id.to_string(),
        pty_id,
    })
}

/// Removes the socket file when the app exits; a crash leaves it for the next start's sweep.
pub fn shutdown() {
    drop(SERVER.lock().unwrap_or_else(|e| e.into_inner()).take());
}

const MAX_SPOOL_FILES: usize = 200;

/// Same layout and guarantees as the script's `spool_event`: written under a dot name and
/// renamed, owner-only, never rewriting a file, capped at the newest `MAX_SPOOL_FILES`.
fn spool_event(base: &Path, tab_id: &str, line: &str) -> std::io::Result<()> {
    static SEQ: AtomicU32 = AtomicU32::new(0);
    let Some(dir) = spool_dir_for_tab(base, tab_id) else {
        return Ok(());
    };
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(&dir)?;
    let micros = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_micros());
    let seq = SEQ.fetch_add(1, Ordering::Relaxed) % 100_000;
    let name = format!("{micros:016}-{:07}-{seq:05}.json", std::process::id());
    let tmp = dir.join(format!(".{name}.tmp"));
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&tmp)?;
    f.write_all(line.as_bytes())?;
    f.write_all(b"\n")?;
    drop(f);
    std::fs::rename(&tmp, dir.join(name))?;
    prune_spool(&dir);
    Ok(())
}

fn prune_spool(dir: &Path) {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    let mut names: Vec<String> = rd
        .filter_map(Result::ok)
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| !n.starts_with('.'))
        .collect();
    if names.len() <= MAX_SPOOL_FILES {
        return;
    }
    names.sort();
    for name in &names[..names.len() - MAX_SPOOL_FILES] {
        let _ = std::fs::remove_file(dir.join(name));
    }
}

#[derive(Debug, PartialEq)]
struct BackgroundSubagent {
    id: String,
    agent_type: String,
    description: String,
}

fn parse_background_subagents(v: &serde_json::Value) -> Vec<BackgroundSubagent> {
    let Some(tasks) = v["background_tasks"].as_array() else {
        return Vec::new();
    };
    tasks
        .iter()
        .filter(|t| {
            t["type"].as_str() == Some("subagent") && t["status"].as_str() == Some("running")
        })
        .filter_map(|t| {
            Some(BackgroundSubagent {
                id: t["id"].as_str()?.to_string(),
                agent_type: t["agent_type"].as_str().unwrap_or("").to_string(),
                description: t["description"].as_str().unwrap_or("").to_string(),
            })
        })
        .collect()
}

struct Payload {
    event: String,
    session_id: String,
    transcript_path: String,
    cwd: String,
    // Agent that produced the event ("claude" when absent, Claude Code's own hooks never
    // send it; OpenCode's plugin does).
    agent: Option<String>,
    // SessionStart
    source: Option<String>,
    session_title: Option<String>,
    model: Option<String>,
    // SessionEnd
    reason: Option<String>,
    // UserPromptSubmit
    prompt: Option<String>,
    // Notification
    notif_message: Option<String>,
    notif_type: Option<String>,
    // Stop
    stop_reason: Option<String>,
    last_message: Option<String>,
    background_subagents: Vec<BackgroundSubagent>,
    // SubagentStart / SubagentStop
    agent_id: Option<String>,
    agent_type: Option<String>,
    agent_description: Option<String>,
    // StopFailure
    error_message: Option<String>,
    // PermissionRequest
    tool_name: Option<String>,
    // PostCompact
    compact_trigger: Option<String>,
    // MessageDisplay
    is_final: bool,
    turn_id: Option<String>,
    delta: Option<String>,
}

/// Codex documents PascalCase event names, which is unmeasured, so its snake_case spelling is
/// read as the same event. Other agents' names are matched exactly.
fn canonical_event(agent: Option<&str>, event: &str) -> String {
    if agent != Some("codex") {
        return event.to_string();
    }
    match event {
        "session_start" => "SessionStart",
        "user_prompt_submit" => "UserPromptSubmit",
        "stop" => "Stop",
        "permission_request" => "PermissionRequest",
        "subagent_start" => "SubagentStart",
        "subagent_stop" => "SubagentStop",
        other => other,
    }
    .to_string()
}

fn parse_payload(json: &str) -> Option<Payload> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let event = canonical_event(v["agent"].as_str(), v["hook_event_name"].as_str()?);
    Some(Payload {
        event,
        session_id: v["session_id"].as_str().unwrap_or("").to_string(),
        transcript_path: v["transcript_path"].as_str().unwrap_or("").to_string(),
        cwd: v["cwd"].as_str().unwrap_or("").to_string(),
        agent: v["agent"].as_str().map(str::to_string),
        source: v["source"].as_str().map(str::to_string),
        session_title: v["sessionTitle"].as_str().map(str::to_string),
        model: v["model"].as_str().map(str::to_string),
        reason: v["reason"].as_str().map(str::to_string),
        prompt: v["prompt"].as_str().map(str::to_string),
        notif_message: v["message"].as_str().map(str::to_string),
        notif_type: v["notification_type"].as_str().map(str::to_string),
        stop_reason: v["stop_reason"].as_str().map(str::to_string),
        last_message: v["last_assistant_message"].as_str().map(str::to_string),
        background_subagents: parse_background_subagents(&v),
        agent_id: v["agent_id"].as_str().map(str::to_string),
        agent_type: v["agent_type"].as_str().map(str::to_string),
        agent_description: v["description"].as_str().map(str::to_string),
        error_message: v["error_message"].as_str().map(str::to_string),
        tool_name: v["tool_name"].as_str().map(str::to_string),
        compact_trigger: v["trigger"].as_str().map(str::to_string),
        is_final: v["final"].as_bool().unwrap_or(false),
        turn_id: v["turn_id"].as_str().map(str::to_string),
        delta: v["delta"].as_str().map(str::to_string),
    })
}

/// Directory undelivered hook events wait in: `trigger-event.sh` writes there when it cannot
/// reach the socket, and the hub when a frame names a tab that has no PTY right now. Mirrors
/// `session_hook_script_path` in `agent/mod.rs`.
fn spool_dir() -> Option<PathBuf> {
    Some(dirs::home_dir()?.join(".config").join("kex").join("spool"))
}

/// The directory holding one file per undelivered event of a tab.
fn spool_dir_for_tab(base: &Path, tab_id: &str) -> Option<PathBuf> {
    is_safe_tab_id(tab_id).then(|| base.join(tab_id))
}

const ORPHAN_TMP_MAX_AGE: std::time::Duration = std::time::Duration::from_secs(24 * 60 * 60);

fn is_older_than(path: &Path, age: std::time::Duration) -> bool {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.elapsed().ok())
        .is_some_and(|e| e > age)
}

/// Replays any hook events spooled to disk by `trigger-event.sh` because a
/// live `send_ipc` delivery failed, handing each payload to `on_line` (in
/// production, `dispatch`) in file-name order, which is arrival order.
///
/// The script writes each event under a dot name and renames it into place,
/// so a visible file is always complete, and it never rewrites an existing
/// file, so there is nothing to claim or lock here. Each file is removed
/// right after it is handed off: a crash mid-drain leaves exactly the
/// undelivered files for the next drain, which is also how a half-drained
/// directory recovers. That trades a possible duplicate (a crash between
/// `on_line` and the remove) for never dropping an event, like the rest of
/// this module (at-least-once). Dot files are the script's in-flight
/// temporaries: left alone unless they are over a day old, when the writer
/// is certainly dead. A file that cannot be read as text is deleted, since
/// it would otherwise stay forever.
fn drain_spool(base: &Path, tab_id: &str, mut on_line: impl FnMut(&str)) {
    let Some(dir) = spool_dir_for_tab(base, tab_id) else {
        log::warn!("[ipc] refusing to drain spool for unsafe tab id {tab_id:?}");
        return;
    };
    let mut files: Vec<PathBuf> = match std::fs::read_dir(&dir) {
        Ok(rd) => rd
            .filter_map(Result::ok)
            .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
            .filter_map(|e| {
                if !e.file_name().to_string_lossy().starts_with('.') {
                    return Some(e.path());
                }
                if is_older_than(&e.path(), ORPHAN_TMP_MAX_AGE) {
                    let _ = std::fs::remove_file(e.path());
                }
                None
            })
            .collect(),
        Err(e) => {
            if e.kind() != std::io::ErrorKind::NotFound {
                log::warn!("[ipc] failed to read spool dir {dir:?}: {e}");
            }
            return;
        }
    };
    files.sort();

    let mut drained = 0usize;
    for path in &files {
        match std::fs::read_to_string(path) {
            Ok(contents) => {
                let payload = contents.trim();
                if !payload.is_empty() {
                    on_line(payload);
                    drained += 1;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => {
                log::warn!("[ipc] discarding unreadable spooled event {path:?}: {e}");
            }
        }
        if let Err(e) = std::fs::remove_file(path) {
            if e.kind() != std::io::ErrorKind::NotFound {
                log::warn!("[ipc] failed to remove drained event {path:?}: {e}");
            }
        }
    }
    if drained > 0 {
        log::debug!("[ipc] drained {drained} spooled event(s) for tab={tab_id}");
    }
    // Fails while a script still has a file in flight, which is fine.
    let _ = std::fs::remove_dir(&dir);
}

/// True when a spooled line is a `SessionEnd`/`StopFailure` notification: a
/// live-only "the agent just finished/crashed" signal that made sense at the
/// moment `trigger-event.sh` couldn't reach the socket, but is actively wrong
/// once replayed after a restart, when Kex may have already relaunched the
/// same tab and recorded a fresh session for it. Unparseable JSON is not
/// stale (it isn't recognized as anything): let it reach `dispatch`, which
/// has its own handling for that case.
fn stale_spooled_event_kind(json: &str) -> Option<String> {
    parse_payload(json)
        .map(|p| p.event)
        .filter(|e| e == "SessionEnd" || e == "StopFailure")
}

/// Debug logging in `dispatch_with` below echoes free-text agent payload fields
/// (prompt, message, diff deltas). A single "final" MessageDisplay for a
/// long code review has been observed to carry 7000+ characters; left
/// unbounded, a handful of such lines are enough to blow through the log
/// rotation size and destroy the history that made those lines worth
/// logging in the first place. Cap what actually reaches the log.
const MAX_LOG_FIELD_LEN: usize = 250;

fn truncate_for_log(s: &str, max: usize) -> String {
    let char_count = s.chars().count();
    if char_count <= max {
        return s.to_string();
    }
    let truncated: String = s.chars().take(max).collect();
    format!("{truncated}...({} more)", char_count - max)
}

/// A subagent's `cwd` says where the subagent runs, not where the main agent
/// is, so only the main agent's own events may move the tab's worktree. A resumed session
/// starts in the launch folder and only moves into its worktree afterwards, so its
/// SessionStart would wipe the worktree the restore plan already seeded.
fn reports_agent_cwd(event: &str, source: &str, cwd: &str) -> bool {
    if cwd.is_empty() {
        return false;
    }
    match event {
        "SessionEnd" | "SubagentStart" | "SubagentStop" => false,
        "SessionStart" => source != "resume",
        _ => true,
    }
}

// Agents that only report their identity on SessionStart (or whose first lifecycle
// event races it) still reach the frontend first: every signal carries the frame's
// agent so the session the UI creates is never mistagged as "claude".
fn agent_signal(id: u32, kind: &str, agent: Option<&str>) -> serde_json::Value {
    serde_json::json!({
        "id":       id,
        "kind":     kind,
        "agent":    agent.unwrap_or("claude"),
        "message":  null,
        "toolName": null,
        "prompt":   null,
    })
}

fn post_compact_signal(id: u32, p: &Payload) -> serde_json::Value {
    let mut sig = agent_signal(id, "PostCompact", p.agent.as_deref());
    sig["trigger"] = p.compact_trigger.as_deref().unwrap_or("").into();
    sig
}

/// Events that reach the frontend as a signal with no side effect on the Rust side.
fn passthrough_signal(p: &Payload, id: u32) -> Option<serde_json::Value> {
    match p.event.as_str() {
        "PostCompact" => Some(post_compact_signal(id, p)),
        _ => None,
    }
}

/// Every event goes through `emit`, so a test can see what a hook payload sends to the frontend.
fn dispatch_with(
    json: &str,
    tab_id: &str,
    pty_id: u32,
    emit: &mut dyn FnMut(&str, serde_json::Value),
    emit_live_model: &mut dyn FnMut(&str),
) {
    let Some(p) = parse_payload(json) else {
        log::debug!(
            "[ipc] invalid JSON: {}",
            truncate_for_log(json, MAX_LOG_FIELD_LEN)
        );
        return;
    };
    if session_store::is_print_run(tab_id) {
        log::debug!(
            "[ipc] {} dropped: tab={tab_id} is running a print-mode agent",
            p.event
        );
        return;
    }
    if reports_agent_cwd(&p.event, p.source.as_deref().unwrap_or(""), &p.cwd) {
        log::debug!("[ipc] cwd tab={tab_id} event={} cwd={:?}", p.event, p.cwd);
        emit(
            AGENT_CWD_EVENT,
            serde_json::json!({ "tabId": tab_id, "cwd": p.cwd }),
        );
    }
    match p.event.as_str() {
        "SessionStart" => {
            let source = p.source.as_deref().unwrap_or("");
            let session_title = p.session_title.as_deref().unwrap_or("");
            let model = p.model.as_deref().unwrap_or("");
            let agent = p.agent.as_deref().unwrap_or("claude");
            log::debug!(
                "[ipc] SessionStart tab={tab_id} agent={agent} session={} \
                 source={source} title={session_title:?} model={model:?}",
                p.session_id
            );
            let same_process = matches!(source, "clear" | "compact" | "resume");
            let launch_known = session_store::record_session(
                tab_id,
                agent,
                &p.session_id,
                &p.transcript_path,
                &p.cwd,
                same_process,
            );
            emit(
                AGENT_SESSION_META_EVENT,
                serde_json::json!({
                    "tabId":          tab_id,
                    "sessionId":      p.session_id,
                    "agent":          agent,
                    "cwdLaunch":      p.cwd,
                    "sessionTitle":   session_title,
                    "model":          model,
                    "transcriptPath": p.transcript_path,
                    "launchKnown":    launch_known,
                }),
            );
        }
        "SessionEnd" => {
            let reason = p.reason.as_deref().unwrap_or("");
            log::debug!("[ipc] SessionEnd tab={tab_id} reason={reason}");
            emit(
                AGENT_EVENT,
                agent_signal(pty_id, "SessionEnd", p.agent.as_deref()),
            );
        }
        "UserPromptSubmit" => {
            let prompt = p.prompt.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] UserPromptSubmit tab={tab_id} session={} prompt={:?}",
                p.session_id,
                truncate_for_log(prompt, MAX_LOG_FIELD_LEN)
            );
            let mut sig = agent_signal(pty_id, "UserPromptSubmit", p.agent.as_deref());
            sig["prompt"] = prompt.into();
            emit(AGENT_EVENT, sig);
        }
        "Notification" => {
            let notif_type = p.notif_type.as_deref().unwrap_or("");
            // "idle_prompt" means Claude finished its turn and is waiting for the
            // next prompt: that is already covered by the "Stop" event, and Claude
            // can resend it (sometimes twice). Drop it to avoid a duplicate
            // attention signal right after the turn ends.
            if notif_type == "idle_prompt" {
                log::debug!("[ipc] Notification(idle_prompt) tab={tab_id} ignored");
                return;
            }
            let msg = p.notif_message.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] Notification tab={tab_id} type={notif_type:?} msg={:?}",
                truncate_for_log(msg, MAX_LOG_FIELD_LEN)
            );
            let mut sig = agent_signal(pty_id, "Notification", p.agent.as_deref());
            sig["message"] = msg.into();
            emit(AGENT_EVENT, sig);
        }
        "Stop" => {
            let reason = p.stop_reason.as_deref().unwrap_or("");
            let last = p.last_message.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] Stop tab={tab_id} reason={reason} last={:?}",
                truncate_for_log(last, MAX_LOG_FIELD_LEN)
            );
            let subagents: Vec<serde_json::Value> = p
                .background_subagents
                .iter()
                .map(|s| {
                    serde_json::json!({
                        "id":          s.id,
                        "agentType":   s.agent_type,
                        "description": s.description,
                    })
                })
                .collect();
            let mut sig = agent_signal(pty_id, "Stop", p.agent.as_deref());
            sig["message"] = last.into();
            sig["backgroundSubagents"] = subagents.into();
            emit(AGENT_EVENT, sig);
            emit_live_model(&p.transcript_path);
        }
        "StopFailure" => {
            let err = p.error_message.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] StopFailure tab={tab_id} err={:?}",
                truncate_for_log(err, MAX_LOG_FIELD_LEN)
            );
            let mut sig = agent_signal(pty_id, "StopFailure", p.agent.as_deref());
            sig["message"] = err.into();
            emit(AGENT_EVENT, sig);
        }
        "PermissionRequest" => {
            let tool = p.tool_name.as_deref().unwrap_or("");
            log::debug!("[ipc] PermissionRequest tab={tab_id} tool={tool}");
            let mut sig = agent_signal(pty_id, "PermissionRequest", p.agent.as_deref());
            sig["toolName"] = tool.into();
            emit(AGENT_EVENT, sig);
        }
        "SubagentStart" | "SubagentStop" => {
            let Some(agent_id) = p.agent_id.as_deref() else {
                return;
            };
            let agent_type = p.agent_type.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] {} tab={tab_id} agent={agent_id} type={agent_type}",
                p.event
            );
            let mut sig = agent_signal(pty_id, &p.event, p.agent.as_deref());
            sig["agentId"] = agent_id.into();
            sig["agentType"] = agent_type.into();
            sig["agentDescription"] = p.agent_description.as_deref().unwrap_or("").into();
            emit(AGENT_EVENT, sig);
        }
        "MessageDisplay" => {
            if !p.is_final {
                return;
            }
            let delta = p.delta.as_deref().unwrap_or("");
            let turn_id = p.turn_id.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] MessageDisplay tab={tab_id} turn={turn_id} delta={:?}",
                truncate_for_log(delta, MAX_LOG_FIELD_LEN)
            );
            let mut sig = agent_signal(pty_id, "MessageDisplay", p.agent.as_deref());
            sig["message"] = delta.into();
            emit(AGENT_EVENT, sig);
        }
        other => match passthrough_signal(&p, pty_id) {
            Some(sig) => {
                log::debug!("[ipc] {other} tab={tab_id}");
                emit(AGENT_EVENT, sig);
            }
            None => log::debug!("[ipc] unhandled event {other} from tab={tab_id}"),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_signal_carries_the_frame_agent() {
        let sig = agent_signal(7, "Stop", Some("omp"));
        assert_eq!(sig["agent"], "omp");
        assert_eq!(sig["id"], 7);
        assert_eq!(sig["kind"], "Stop");
        assert_eq!(sig["message"], serde_json::Value::Null);
        assert_eq!(sig["toolName"], serde_json::Value::Null);
        assert_eq!(sig["prompt"], serde_json::Value::Null);
    }

    #[test]
    fn agent_signal_falls_back_to_claude() {
        let sig = agent_signal(1, "UserPromptSubmit", None);
        assert_eq!(sig["agent"], "claude");
    }

    #[test]
    fn socket_path_is_short_enough() {
        let p = socket_path_in(&runtime_dir());
        assert!(p.to_str().unwrap().len() < 104);
    }

    #[test]
    fn two_processes_get_different_socket_names() {
        assert_ne!(socket_file_name(100), socket_file_name(200));
    }

    #[test]
    fn socket_path_embeds_the_current_pid() {
        let p = socket_path_in(Path::new("/x"));
        let expected = socket_file_name(std::process::id());
        assert_eq!(p.file_name().unwrap().to_str().unwrap(), expected);
    }

    #[test]
    fn orphan_cleanup_only_selects_dead_pids_and_matching_names() {
        let names: Vec<String> = [
            "kex-ipc-100.sock",
            "kex-ipc-200.sock",
            "kex-ipc-300.sock",
            "kex-ipc-abc.sock",
            "kex-ipc-100.txt",
            "other-100.sock",
        ]
        .map(String::from)
        .to_vec();
        let found = orphaned_sockets(&names, |pid| pid == 200);
        assert_eq!(found, vec!["kex-ipc-100.sock", "kex-ipc-300.sock"]);
    }

    #[test]
    fn sweep_removes_dead_pid_sockets_and_keeps_live_and_unrelated_files() {
        let dir = tempfile::tempdir().unwrap();
        let mut child = std::process::Command::new("true").spawn().unwrap();
        let dead = child.id();
        child.wait().unwrap();
        let orphan = socket_file_name(dead);
        let live = socket_file_name(std::process::id());
        for name in [
            orphan.as_str(),
            live.as_str(),
            "kex-ipc-x.sock",
            "notes.txt",
        ] {
            std::fs::write(dir.path().join(name), b"").unwrap();
        }
        sweep_orphaned_sockets(dir.path());
        assert!(!dir.path().join(&orphan).exists());
        for name in [live.as_str(), "kex-ipc-x.sock", "notes.txt"] {
            assert!(dir.path().join(name).exists(), "{name} must survive");
        }
    }

    #[test]
    fn pid_is_alive_detects_self_and_not_a_dead_pid() {
        assert!(pid_is_alive(std::process::id()));
        let mut child = std::process::Command::new("true").spawn().unwrap();
        let pid = child.id();
        child.wait().unwrap();
        assert!(!pid_is_alive(pid));
    }

    #[test]
    fn truncate_for_log_leaves_shorter_strings_untouched() {
        assert_eq!(truncate_for_log("hello", 250), "hello");
    }

    #[test]
    fn truncate_for_log_leaves_strings_at_the_limit_untouched() {
        let s = "a".repeat(250);
        assert_eq!(truncate_for_log(&s, 250), s);
    }

    #[test]
    fn truncate_for_log_truncates_and_appends_a_remaining_count() {
        let s = "a".repeat(300);
        let truncated = truncate_for_log(&s, 250);
        assert_eq!(truncated, format!("{}...(50 more)", "a".repeat(250)));
    }

    #[test]
    fn truncate_for_log_counts_chars_not_bytes() {
        // "€" is 3 bytes in UTF-8; 250 is not a multiple of 3, so a naive byte
        // slice at offset 250 would land mid-codepoint (unlike a 2-byte char at
        // an even max, which happens to fall on a char boundary by coincidence).
        let s = "€".repeat(300);
        let truncated = truncate_for_log(&s, 250);
        assert_eq!(
            truncated.chars().count(),
            250 + "...(50 more)".chars().count()
        );
    }

    #[test]
    fn owned_runtime_subdir_is_created_owner_only() {
        let base = tempfile::tempdir().unwrap();
        let uid = unsafe { libc::getuid() };

        let dir = owned_runtime_subdir(base.path(), uid);
        let mode = std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777;
        assert_eq!(
            mode, 0o700,
            "runtime subdir must be owner-only, got {mode:o}"
        );
    }

    #[test]
    fn owned_runtime_subdir_reuses_its_own_directory() {
        // Simulates a second app launch finding the directory from a
        // previous run: it must be recognized as ours (same uid) and reused
        // rather than rejected as looking untrusted.
        let base = tempfile::tempdir().unwrap();
        let uid = unsafe { libc::getuid() };

        let first = owned_runtime_subdir(base.path(), uid);
        let second = owned_runtime_subdir(base.path(), uid);
        assert_eq!(first, second);
        let mode = std::fs::metadata(&second).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o700);
    }

    #[derive(Default)]
    struct Recorder {
        events: Mutex<Vec<(String, serde_json::Value)>>,
    }

    impl Recorder {
        fn signals(&self) -> Vec<(serde_json::Value, String)> {
            self.events
                .lock()
                .unwrap()
                .iter()
                .filter(|(e, _)| e == AGENT_EVENT)
                .map(|(_, sig)| (sig["id"].clone(), sig["kind"].as_str().unwrap().to_string()))
                .collect()
        }

        fn meta_tabs(&self) -> Vec<String> {
            self.events
                .lock()
                .unwrap()
                .iter()
                .filter(|(e, _)| e == AGENT_SESSION_META_EVENT)
                .map(|(_, m)| m["tabId"].as_str().unwrap().to_string())
                .collect()
        }
    }

    struct RecordingSink(Arc<Recorder>);

    impl HookSink for RecordingSink {
        fn emit(&self, event: &str, payload: serde_json::Value) {
            self.0
                .events
                .lock()
                .unwrap()
                .push((event.to_string(), payload));
        }

        fn live_model(&self, _: &str, _: &str) {}
    }

    fn test_hub(spool: Option<PathBuf>) -> (&'static HookHub, Arc<Recorder>) {
        let rec = Arc::new(Recorder::default());
        let hub = Box::leak(Box::new(HookHub::new(
            Box::new(RecordingSink(rec.clone())),
            spool,
        )));
        (hub, rec)
    }

    fn frame(event: &str, tab: &str, pty: u32, session: &str) -> String {
        format!(
            r#"{{"hook_event_name":"{event}","session_id":"{session}","tab_id":"{tab}","pty_id":"{pty}","cwd":""}}"#
        )
    }

    fn send(path: &Path, line: &str) {
        let mut s = UnixStream::connect(path).unwrap();
        s.write_all(line.as_bytes()).unwrap();
        s.write_all(b"\n").unwrap();
    }

    fn wait_until(mut done: impl FnMut() -> bool) -> bool {
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while std::time::Instant::now() < deadline {
            if done() {
                return true;
            }
            thread::sleep(Duration::from_millis(10));
        }
        done()
    }

    #[test]
    fn the_hook_server_socket_is_owner_only_and_removed_on_drop() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("kex-ipc-perm.sock");
        let (hub, _) = test_hub(None);
        let server = HookServer::start(path.clone(), hub).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "socket file must be owner-only, got {mode:o}");
        drop(server);
        assert!(!path.exists());
    }

    #[test]
    fn dropping_the_hook_server_joins_its_thread() {
        // Unlinking alone never wakes a thread parked in accept(); Drop joins it, so a missing
        // wakeup would hang here instead of passing.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("kex-ipc-join.sock");
        let (hub, _) = test_hub(None);
        let server = HookServer::start(path, hub).unwrap();
        thread::sleep(Duration::from_millis(50));
        let (tx, rx) = std::sync::mpsc::channel();
        thread::spawn(move || {
            drop(server);
            let _ = tx.send(());
        });
        assert!(rx.recv_timeout(Duration::from_secs(2)).is_ok());
    }

    #[test]
    fn one_listener_keeps_two_concurrent_tabs_apart() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("kex-ipc-two.sock");
        let (hub, rec) = test_hub(None);
        live(hub, "tab-a", 1);
        live(hub, "tab-b", 2);
        let _server = HookServer::start(path.clone(), hub).unwrap();

        const PER_TAB: usize = 40;
        let clients: Vec<_> = [("tab-a", 1u32), ("tab-b", 2u32)]
            .into_iter()
            .map(|(tab, pty)| {
                let path = path.clone();
                thread::spawn(move || {
                    for i in 0..PER_TAB {
                        let kind = if i == 0 { "SessionStart" } else { "Stop" };
                        send(&path, &frame(kind, tab, pty, &format!("{tab}-s")));
                    }
                })
            })
            .collect();
        for c in clients {
            c.join().unwrap();
        }

        assert!(wait_until(
            || rec.events.lock().unwrap().len() == 2 * PER_TAB
        ));
        let signals = rec.signals();
        let of = |id: u32| signals.iter().filter(|(i, _)| *i == id).count();
        assert_eq!(of(1), PER_TAB - 1);
        assert_eq!(of(2), PER_TAB - 1);
        let mut metas = rec.meta_tabs();
        metas.sort();
        assert_eq!(metas, vec!["tab-a", "tab-b"]);
        for (_, payload) in rec.events.lock().unwrap().iter() {
            if let Some(sid) = payload["sessionId"].as_str() {
                assert!(sid.starts_with(payload["tabId"].as_str().unwrap()));
            }
        }
    }

    #[test]
    fn a_frame_cannot_reach_a_tab_through_another_tabs_pty() {
        let (hub, rec) = test_hub(None);
        live(hub, "tab-a", 1);
        live(hub, "tab-b", 2);
        hub.handle_line(&frame("Stop", "tab-b", 1, "s"));
        assert_eq!(rec.signals(), vec![(2.into(), "Stop".to_string())]);
    }

    #[test]
    fn frames_without_a_safe_tab_are_dropped() {
        let dir = tempfile::tempdir().unwrap();
        let (hub, rec) = test_hub(Some(dir.path().to_path_buf()));
        live(hub, "tab-a", 1);
        hub.handle_line(r#"{"hook_event_name":"Stop","session_id":"s"}"#);
        hub.handle_line(r#"{"hook_event_name":"Stop","tab_id":"../x","pty_id":"1"}"#);
        hub.handle_line("not json");
        assert!(rec.events.lock().unwrap().is_empty());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    fn live(hub: &'static HookHub, tab: &str, pty: u32) {
        hub.register(tab, pty);
        hub.activate(tab, pty);
    }

    #[test]
    fn a_late_frame_of_a_restarted_pty_reaches_the_new_one_without_rewriting_or_ending_it() {
        let (hub, rec) = test_hub(None);
        let old = TabLease {
            hub,
            tab_id: "tab-a".into(),
            pty_id: 1,
        };
        live(hub, "tab-a", 1);
        live(hub, "tab-a", 2);
        drop(old);
        for kind in [
            "Stop",
            "SessionEnd",
            "StopFailure",
            "SessionStart",
            "UserPromptSubmit",
            "Notification",
        ] {
            hub.handle_line(&frame(kind, "tab-a", 1, "dead"));
        }
        hub.handle_line(&frame("UserPromptSubmit", "tab-a", 2, "s"));
        assert_eq!(
            rec.signals(),
            vec![
                (2.into(), "Stop".to_string()),
                (2.into(), "Notification".to_string()),
                (2.into(), "UserPromptSubmit".to_string())
            ]
        );
        assert!(
            rec.meta_tabs().is_empty(),
            "a late SessionStart records nothing"
        );
    }

    struct PanickingSink;

    impl HookSink for PanickingSink {
        fn emit(&self, _: &str, _: serde_json::Value) {
            panic!("sink failure");
        }

        fn live_model(&self, _: &str, _: &str) {}
    }

    #[test]
    fn a_panic_while_handling_a_frame_spares_the_listener_and_the_registry() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("kex-ipc-panic.sock");
        let hub: &'static HookHub =
            Box::leak(Box::new(HookHub::new(Box::new(PanickingSink), None)));
        live(hub, "tab-a", 1);
        let _server = HookServer::start(path.clone(), hub).unwrap();
        send(&path, &frame("Stop", "tab-a", 1, "s"));
        thread::sleep(Duration::from_millis(100));
        assert!(!hub.tabs.is_poisoned());
        live(hub, "tab-b", 2);
        assert_eq!(hub.tabs().current("tab-b"), Some(2));
        UnixStream::connect(&path).expect("the listener is still accepting");

        hub.tabs.clear_poison();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = hub.tabs.lock().unwrap();
            panic!("poison it");
        }));
        assert!(hub.tabs.is_poisoned());
        live(hub, "tab-c", 3);
        assert_eq!(hub.tabs().current("tab-c"), Some(3));
    }

    #[test]
    fn a_pty_that_never_goes_live_leaves_the_spool_for_the_next_one() {
        let dir = tempfile::tempdir().unwrap();
        let (hub, rec) = test_hub(Some(dir.path().to_path_buf()));
        hub.handle_line(&frame("Notification", "tab-a", 1, "s"));
        let failed = TabLease {
            hub,
            tab_id: "tab-a".into(),
            pty_id: 2,
        };
        hub.register("tab-a", 2);
        hub.handle_line(&frame("Stop", "tab-a", 2, "s"));
        drop(failed);
        assert!(rec.events.lock().unwrap().is_empty());
        assert_eq!(
            std::fs::read_dir(dir.path().join("tab-a")).unwrap().count(),
            2
        );

        live(hub, "tab-a", 3);
        assert_eq!(
            rec.signals(),
            vec![
                (3.into(), "Notification".to_string()),
                (3.into(), "Stop".to_string())
            ]
        );
    }

    #[test]
    fn frames_for_a_tab_between_ptys_are_spooled_and_replayed_on_its_next_pty() {
        let dir = tempfile::tempdir().unwrap();
        let (hub, rec) = test_hub(Some(dir.path().to_path_buf()));
        hub.handle_line(&frame("Notification", "tab-a", 1, "s"));
        hub.handle_line(&frame("SessionEnd", "tab-a", 1, "s"));
        hub.handle_line(&frame("Stop", "tab-a", 1, "s"));
        assert!(rec.events.lock().unwrap().is_empty());
        let spooled = std::fs::read_dir(dir.path().join("tab-a")).unwrap().count();
        assert_eq!(spooled, 2, "SessionEnd is never spooled");

        live(hub, "tab-a", 7);
        assert_eq!(
            rec.signals(),
            vec![
                (7.into(), "Notification".to_string()),
                (7.into(), "Stop".to_string())
            ]
        );
        assert!(!dir.path().join("tab-a").exists());
    }

    #[test]
    fn the_hub_spool_is_owner_only_and_capped() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..(MAX_SPOOL_FILES + 5) {
            spool_event(dir.path(), "tab-cap", &format!("{{\"n\":{i}}}")).unwrap();
        }
        let tab = dir.path().join("tab-cap");
        let mut names: Vec<_> = std::fs::read_dir(&tab)
            .unwrap()
            .map(|e| e.unwrap().path())
            .collect();
        names.sort();
        assert_eq!(names.len(), MAX_SPOOL_FILES);
        let first = std::fs::read_to_string(&names[0]).unwrap();
        assert_eq!(first.trim(), "{\"n\":5}", "the oldest are pruned");
        let mode = |p: &Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&tab), 0o700);
        assert_eq!(mode(&names[0]), 0o600);
    }

    #[test]
    fn a_client_that_never_writes_does_not_block_the_others_for_good() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("kex-ipc-slow.sock");
        let (hub, rec) = test_hub(None);
        live(hub, "tab-a", 1);
        let _server = HookServer::start(path.clone(), hub).unwrap();
        let _idle = UnixStream::connect(&path).unwrap();
        send(&path, &frame("Stop", "tab-a", 1, "s"));
        assert!(wait_until(|| rec.signals().len() == 1));
    }

    #[test]
    fn a_client_that_trickles_bytes_is_cut_at_the_deadline_and_others_are_served() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("kex-ipc-drip.sock");
        let (hub, rec) = test_hub(None);
        live(hub, "tab-a", 1);
        let _server = HookServer::start(path.clone(), hub).unwrap();

        let drip_path = path.clone();
        let dripper = thread::spawn(move || {
            let mut s = UnixStream::connect(&drip_path).unwrap();
            let started = std::time::Instant::now();
            while started.elapsed() < Duration::from_secs(10) {
                if s.write_all(b"{").is_err() {
                    return Some(started.elapsed());
                }
                thread::sleep(Duration::from_millis(50));
            }
            None
        });
        thread::sleep(Duration::from_millis(100));
        let sent_at = std::time::Instant::now();
        send(&path, &frame("Stop", "tab-a", 1, "s"));
        assert!(wait_until(|| rec.signals().len() == 1));
        assert!(
            sent_at.elapsed() < FRAME_DEADLINE * 3,
            "the other client waited {:?}",
            sent_at.elapsed()
        );
        let cut = dripper
            .join()
            .unwrap()
            .expect("the trickling client was never cut");
        assert!(cut < Duration::from_secs(3), "cut after {cut:?}");
    }

    #[test]
    fn a_failed_bind_is_retried_until_one_succeeds_and_then_never_again() {
        let mut slot: Option<u32> = None;
        let mut calls = 0;
        let path = Path::new("/x/kex-ipc-1.sock");
        ensure_server(&mut slot, path, |_| {
            calls += 1;
            Err(std::io::Error::other("busy"))
        });
        assert_eq!(slot, None);
        ensure_server(&mut slot, path, |_| {
            calls += 1;
            Ok(7)
        });
        assert_eq!(slot, Some(7));
        ensure_server(&mut slot, path, |_| {
            calls += 1;
            Ok(8)
        });
        assert_eq!((slot, calls), (Some(7), 2));
    }

    #[test]
    fn a_retried_bind_takes_over_a_path_that_was_unusable_before() {
        let dir = tempfile::tempdir().unwrap();
        let blocked = dir.path().join("missing-dir").join("kex-ipc-r.sock");
        let (hub, _) = test_hub(None);
        let mut slot = None;
        ensure_server(&mut slot, &blocked, |p| {
            HookServer::start(p.to_path_buf(), hub)
        });
        assert!(slot.is_none());
        std::fs::create_dir(blocked.parent().unwrap()).unwrap();
        ensure_server(&mut slot, &blocked, |p| {
            HookServer::start(p.to_path_buf(), hub)
        });
        assert!(slot.is_some());
        assert!(UnixStream::connect(&blocked).is_ok());
    }

    #[test]
    fn accept_errors_back_off_and_are_capped_instead_of_stopping_the_listener() {
        assert_eq!(accept_backoff(1), Duration::from_millis(10));
        assert_eq!(accept_backoff(2), Duration::from_millis(20));
        assert_eq!(accept_backoff(5), Duration::from_millis(160));
        assert_eq!(accept_backoff(8), ACCEPT_BACKOFF_MAX);
        assert_eq!(accept_backoff(u32::MAX), ACCEPT_BACKOFF_MAX);
        let mut prev = Duration::ZERO;
        for n in 1..40 {
            assert!(accept_backoff(n) >= prev);
            prev = accept_backoff(n);
        }
    }

    #[test]
    fn read_frame_keeps_a_frame_ended_by_eof_and_drops_an_oversized_one() {
        let (mut a, b) = UnixStream::pair().unwrap();
        a.write_all(b"{\"x\":1}").unwrap();
        drop(a);
        let deadline = Instant::now() + FRAME_DEADLINE;
        assert_eq!(read_frame(b, deadline).as_deref(), Some("{\"x\":1}"));

        let (a, b) = UnixStream::pair().unwrap();
        let writer = thread::spawn(move || {
            let mut a = a;
            let big = vec![b'a'; MAX_FRAME_BYTES + 16 * 1024];
            let _ = a.write_all(&big);
        });
        assert_eq!(read_frame(b, Instant::now() + Duration::from_secs(5)), None);
        writer.join().unwrap();
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
    fn parse_payload_carries_the_agent_when_present() {
        let json = r#"{
          "hook_event_name": "SessionStart",
          "agent": "opencode",
          "session_id": "ses_abc",
          "transcript_path": "",
          "cwd": "/home/user",
          "source": "startup"
        }"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.agent.as_deref(), Some("opencode"));
    }

    #[test]
    fn parse_a_codex_session_start_with_a_null_transcript_path() {
        let json = r#"{
          "hook_event_name": "SessionStart",
          "agent": "codex",
          "session_id": "01a13d02-8fbe-7d52-81ec-73ccfdbc1f1e",
          "transcript_path": null,
          "cwd": "/home/user/proj",
          "source": "startup",
          "model": "gpt-5-codex",
          "permission_mode": "default"
        }"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "SessionStart");
        assert_eq!(p.agent.as_deref(), Some("codex"));
        assert_eq!(p.session_id, "01a13d02-8fbe-7d52-81ec-73ccfdbc1f1e");
        assert_eq!(p.transcript_path, "");
        assert_eq!(p.cwd, "/home/user/proj");
        assert_eq!(p.source.as_deref(), Some("startup"));
        assert!(reports_agent_cwd(&p.event, "startup", &p.cwd));
    }

    #[test]
    fn codex_frames_other_than_session_start_become_codex_signals() {
        for event in ["UserPromptSubmit", "Stop", "PermissionRequest"] {
            let json = format!(
                r#"{{"hook_event_name":"{event}","agent":"codex","session_id":"s","transcript_path":"/x/rollout-1-s.jsonl","cwd":"/p"}}"#
            );
            let p = parse_payload(&json).unwrap();
            assert_eq!(p.transcript_path, "/x/rollout-1-s.jsonl");
            let sig = agent_signal(3, &p.event, p.agent.as_deref());
            assert_eq!(sig["agent"], "codex", "{event}");
            assert_eq!(sig["kind"], event);
        }
    }

    #[test]
    fn codex_snake_case_events_are_read_as_their_canonical_names() {
        for (snake, canonical) in [
            ("session_start", "SessionStart"),
            ("user_prompt_submit", "UserPromptSubmit"),
            ("stop", "Stop"),
            ("permission_request", "PermissionRequest"),
            ("subagent_start", "SubagentStart"),
            ("subagent_stop", "SubagentStop"),
            ("Stop", "Stop"),
        ] {
            let json = format!(
                r#"{{"hook_event_name":"{snake}","agent":"codex","session_id":"s","cwd":"/p"}}"#
            );
            assert_eq!(parse_payload(&json).unwrap().event, canonical, "{snake}");
        }
    }

    #[test]
    fn claude_and_opencode_event_names_are_never_rewritten() {
        for agent in [None, Some("claude"), Some("opencode")] {
            let tag = agent.map_or(String::new(), |a| format!(r#","agent":"{a}""#));
            let json = format!(r#"{{"hook_event_name":"session_start","session_id":"s"{tag}}}"#);
            assert_eq!(parse_payload(&json).unwrap().event, "session_start");
        }
    }

    #[test]
    fn parse_payload_leaves_the_agent_absent_for_claude_frames() {
        let json = r#"{"hook_event_name":"SessionStart","session_id":"abc","transcript_path":"","cwd":""}"#;
        let p = parse_payload(json).unwrap();
        assert!(p.agent.is_none());
    }

    #[test]
    fn parse_rejects_invalid_json() {
        assert!(parse_payload("not json").is_none());
        assert!(parse_payload("").is_none());
    }

    #[test]
    fn parse_user_prompt_submit() {
        let json = r#"{"hook_event_name":"UserPromptSubmit","session_id":"s","transcript_path":"","cwd":"","prompt":"hello world"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "UserPromptSubmit");
        assert_eq!(p.prompt.as_deref(), Some("hello world"));
    }

    #[test]
    fn parse_stop_payload() {
        let json = r#"{"hook_event_name":"Stop","session_id":"s","transcript_path":"","cwd":"","stop_reason":"end_turn","last_assistant_message":"done"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.stop_reason.as_deref(), Some("end_turn"));
        assert_eq!(p.last_message.as_deref(), Some("done"));
    }

    #[test]
    fn parse_subagent_start() {
        let json = r#"{"hook_event_name":"SubagentStart","session_id":"s","transcript_path":"","cwd":"","agent_id":"a1","agent_type":"general-purpose"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "SubagentStart");
        assert_eq!(p.agent_id.as_deref(), Some("a1"));
        assert_eq!(p.agent_type.as_deref(), Some("general-purpose"));
    }

    #[test]
    fn parse_subagent_start_reads_the_description_when_the_agent_sends_one() {
        let json = r#"{"hook_event_name":"SubagentStart","session_id":"s","transcript_path":"","cwd":"","agent_id":"a1","agent_type":"task","description":"Contar archivos"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.agent_description.as_deref(), Some("Contar archivos"));
        let bare = r#"{"hook_event_name":"SubagentStart","session_id":"s","transcript_path":"","cwd":"","agent_id":"a1"}"#;
        assert_eq!(parse_payload(bare).unwrap().agent_description, None);
    }

    #[test]
    fn parse_stop_keeps_only_running_subagents() {
        let json = r#"{"hook_event_name":"Stop","session_id":"s","transcript_path":"","cwd":"","background_tasks":[
            {"id":"a1","type":"subagent","status":"running","description":"do it","agent_type":"Explore"},
            {"id":"a2","type":"subagent","status":"completed","description":"old","agent_type":"Explore"},
            {"id":"b1","type":"shell","status":"running","description":"npm run dev"}
        ]}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(
            p.background_subagents,
            vec![BackgroundSubagent {
                id: "a1".into(),
                agent_type: "Explore".into(),
                description: "do it".into(),
            }]
        );
    }

    #[test]
    fn parse_stop_without_background_tasks_has_no_subagents() {
        let json = r#"{"hook_event_name":"Stop","session_id":"s","transcript_path":"","cwd":""}"#;
        assert!(parse_payload(json).unwrap().background_subagents.is_empty());
    }

    #[test]
    fn only_main_agent_events_report_the_agent_cwd() {
        assert!(reports_agent_cwd("Stop", "", "/p"));
        assert!(reports_agent_cwd("UserPromptSubmit", "", "/p"));
        assert!(!reports_agent_cwd("Stop", "", ""));
        assert!(!reports_agent_cwd("SessionEnd", "", "/p"));
        assert!(!reports_agent_cwd("SubagentStart", "", "/p"));
        assert!(!reports_agent_cwd("SubagentStop", "", "/p"));
    }

    #[test]
    fn a_resumed_session_start_does_not_report_the_agent_cwd() {
        assert!(!reports_agent_cwd("SessionStart", "resume", "/p"));
        assert!(reports_agent_cwd("SessionStart", "startup", "/p"));
        assert!(reports_agent_cwd("SessionStart", "", "/p"));
        assert!(reports_agent_cwd("UserPromptSubmit", "resume", "/p"));
    }

    #[test]
    fn parse_stop_failure() {
        let json = r#"{"hook_event_name":"StopFailure","session_id":"s","transcript_path":"","cwd":"","error_message":"oops"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.error_message.as_deref(), Some("oops"));
    }

    #[test]
    fn post_compact_reaches_the_frontend_as_a_signal_with_its_trigger() {
        let json = r#"{"hook_event_name":"PostCompact","session_id":"s","transcript_path":"","cwd":"/p","trigger":"manual"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "PostCompact");
        assert!(reports_agent_cwd(&p.event, "", &p.cwd));
        let sig = post_compact_signal(3, &p);
        assert_eq!(sig["kind"], "PostCompact");
        assert_eq!(sig["id"], 3);
        assert_eq!(sig["agent"], "claude");
        assert_eq!(sig["trigger"], "manual");
    }

    #[test]
    fn dispatching_a_post_compact_payload_emits_its_signal() {
        let json = r#"{"hook_event_name":"PostCompact","session_id":"s","trigger":"manual"}"#;
        let mut emitted = Vec::new();
        dispatch_with(
            json,
            "tab-post-compact",
            9,
            &mut |event, payload| emitted.push((event.to_string(), payload)),
            &mut |_| {},
        );
        let kinds: Vec<_> = emitted
            .iter()
            .filter(|(event, _)| event == AGENT_EVENT)
            .map(|(_, sig)| {
                (
                    sig["kind"].clone(),
                    sig["id"].clone(),
                    sig["trigger"].clone(),
                )
            })
            .collect();
        assert_eq!(
            kinds,
            vec![("PostCompact".into(), 9.into(), "manual".into())]
        );
    }

    #[test]
    fn post_compact_is_dispatched_as_a_passthrough_signal() {
        let json = r#"{"hook_event_name":"PostCompact","session_id":"s","trigger":"auto"}"#;
        let sig = passthrough_signal(&parse_payload(json).unwrap(), 5).expect("no signal");
        assert_eq!(sig["kind"], "PostCompact");
        assert_eq!(sig["trigger"], "auto");
        let other = r#"{"hook_event_name":"PreToolUse","session_id":"s"}"#;
        assert!(passthrough_signal(&parse_payload(other).unwrap(), 5).is_none());
    }

    #[test]
    fn post_compact_without_a_trigger_sends_an_empty_one() {
        let json = r#"{"hook_event_name":"PostCompact","session_id":"s"}"#;
        let sig = post_compact_signal(1, &parse_payload(json).unwrap());
        assert_eq!(sig["trigger"], "");
    }

    #[test]
    fn parse_permission_request() {
        let json = r#"{"hook_event_name":"PermissionRequest","session_id":"s","transcript_path":"","cwd":"","tool_name":"bash"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.tool_name.as_deref(), Some("bash"));
    }

    #[test]
    fn parse_message_display_final() {
        let json = r#"{"hook_event_name":"MessageDisplay","session_id":"s","transcript_path":"","cwd":"","final":true,"turn_id":"t1","delta":"hello"}"#;
        let p = parse_payload(json).unwrap();
        assert!(p.is_final);
        assert_eq!(p.turn_id.as_deref(), Some("t1"));
        assert_eq!(p.delta.as_deref(), Some("hello"));
    }

    fn spool_event_file(base: &Path, tab_id: &str, name: &str, body: &str) -> PathBuf {
        let dir = spool_dir_for_tab(base, tab_id).unwrap();
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn drain_spool_replays_events_in_file_name_order_then_removes_them_and_the_directory() {
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-1";
        spool_event_file(dir.path(), tab_id, "0002-b.json", "line-two\n");
        spool_event_file(dir.path(), tab_id, "0003-c.json", "line-three\n");
        spool_event_file(dir.path(), tab_id, "0001-a.json", "line-one\n");

        let mut seen = Vec::new();
        drain_spool(dir.path(), tab_id, |line| seen.push(line.to_string()));

        assert_eq!(seen, vec!["line-one", "line-two", "line-three"]);
        assert!(!spool_dir_for_tab(dir.path(), tab_id).unwrap().exists());
    }

    #[test]
    fn drain_spool_never_touches_files_outside_the_spool_for_unsafe_tab_ids() {
        let root = tempfile::tempdir().unwrap();
        let base = root.path().join("spool");
        std::fs::create_dir_all(&base).unwrap();
        let victim = root.path().join("victim.json");
        std::fs::write(&victim, "keep").unwrap();
        let abs = root.path().to_string_lossy().to_string();
        for tab in ["..", "../", abs.as_str(), "", "a/b"] {
            let mut called = false;
            drain_spool(&base, tab, |_| called = true);
            assert!(!called, "{tab:?}");
        }
        assert!(victim.exists());
    }

    #[test]
    fn drain_spool_deletes_unreadable_files_and_day_old_orphan_temporaries() {
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-junk";
        let bad = spool_event_file(dir.path(), tab_id, "0001-a.json", "x");
        std::fs::write(&bad, [0xff, 0xfe, 0xfd]).unwrap();
        let old_tmp = spool_event_file(dir.path(), tab_id, ".0002-b.json.tmp", "half");
        let two_days = std::time::SystemTime::now() - std::time::Duration::from_secs(2 * 86400);
        std::fs::File::options()
            .write(true)
            .open(&old_tmp)
            .unwrap()
            .set_modified(two_days)
            .unwrap();
        spool_event_file(dir.path(), tab_id, "0003-c.json", "ok\n");

        let mut seen = Vec::new();
        drain_spool(dir.path(), tab_id, |line| seen.push(line.to_string()));

        assert_eq!(seen, vec!["ok"]);
        assert!(!bad.exists());
        assert!(!old_tmp.exists());
        assert!(!spool_dir_for_tab(dir.path(), tab_id).unwrap().exists());
    }

    #[test]
    fn drain_spool_is_a_noop_when_no_spool_directory_exists() {
        let dir = tempfile::tempdir().unwrap();
        let mut called = false;
        drain_spool(dir.path(), "tab-missing", |_| called = true);
        assert!(!called);
    }

    #[test]
    fn drain_spool_skips_blank_files_and_in_flight_dot_files() {
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-2";
        spool_event_file(dir.path(), tab_id, "0001-a.json", "\n  \n");
        let in_flight = spool_event_file(dir.path(), tab_id, ".0002-b.json.tmp", "half");
        spool_event_file(dir.path(), tab_id, "0003-c.json", "real\n");

        let mut seen = Vec::new();
        drain_spool(dir.path(), tab_id, |line| seen.push(line.to_string()));

        assert_eq!(seen, vec!["real"]);
        assert!(
            in_flight.exists(),
            "a temporary being written is not ours to touch"
        );
    }

    #[test]
    fn drain_spool_leaves_other_tabs_spool_directories_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let other = spool_event_file(dir.path(), "tab-other", "0001-a.json", "other\n");
        let mut called = false;
        drain_spool(dir.path(), "tab-drain-3", |_| called = true);
        assert!(!called);
        assert!(other.exists());
    }

    #[test]
    fn drain_spool_resumes_a_directory_left_half_drained_by_a_crash() {
        // A crash after the first event was handed off and removed leaves only
        // the rest; a new file arriving meanwhile sorts after them.
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-crash";
        spool_event_file(dir.path(), tab_id, "0002-b.json", "second\n");
        spool_event_file(dir.path(), tab_id, "0003-c.json", "third\n");
        spool_event_file(dir.path(), tab_id, "0004-d.json", "fourth\n");

        let mut seen = Vec::new();
        drain_spool(dir.path(), tab_id, |line| seen.push(line.to_string()));

        assert_eq!(seen, vec!["second", "third", "fourth"]);
        assert!(!spool_dir_for_tab(dir.path(), tab_id).unwrap().exists());
    }

    #[test]
    fn drain_spool_keeps_a_file_whose_handoff_did_not_finish() {
        // The file is removed only after on_line returns, so a panic inside it
        // (standing in for a crash) leaves the event for the next drain.
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-panic";
        let kept = spool_event_file(dir.path(), tab_id, "0001-a.json", "boom\n");

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            drain_spool(dir.path(), tab_id, |_| panic!("crash"));
        }));

        assert!(result.is_err());
        assert!(kept.exists());
    }

    #[test]
    fn drain_spool_payloads_parse_the_same_way_a_live_payload_does() {
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-4";
        let payload = r#"{"hook_event_name":"Stop","session_id":"s","transcript_path":"","cwd":"","stop_reason":"end_turn","last_assistant_message":"done"}"#;
        spool_event_file(dir.path(), tab_id, "0001-a.json", &format!("{payload}\n"));

        let mut events = Vec::new();
        drain_spool(dir.path(), tab_id, |line| {
            events.push(parse_payload(line).unwrap().event);
        });
        assert_eq!(events, vec!["Stop"]);
    }

    #[test]
    fn stale_spooled_event_kind_flags_session_end_and_stop_failure() {
        let session_end = r#"{"hook_event_name":"SessionEnd","session_id":"s","transcript_path":"","cwd":"","reason":"exit"}"#;
        let stop_failure = r#"{"hook_event_name":"StopFailure","session_id":"s","transcript_path":"","cwd":"","error_message":"oops"}"#;
        assert_eq!(
            stale_spooled_event_kind(session_end).as_deref(),
            Some("SessionEnd")
        );
        assert_eq!(
            stale_spooled_event_kind(stop_failure).as_deref(),
            Some("StopFailure")
        );
    }

    #[test]
    fn stale_spooled_event_kind_is_none_for_other_events_and_invalid_json() {
        let session_start =
            r#"{"hook_event_name":"SessionStart","session_id":"s","transcript_path":"","cwd":""}"#;
        assert_eq!(stale_spooled_event_kind(session_start), None);
        assert_eq!(stale_spooled_event_kind("not json"), None);
    }

    #[test]
    fn drain_spool_discards_stale_session_end_and_stop_failure_but_replays_other_events() {
        // Regression test: a SessionEnd/StopFailure that lands in the spool
        // (socket unreachable while Kex was shutting down) must never reach
        // `on_line` on the next drain, since by then Kex may have already
        // relaunched the same tab with a fresh session. Other event kinds
        // still replay normally.
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-stale";
        let session_end = r#"{"hook_event_name":"SessionEnd","session_id":"s","transcript_path":"","cwd":"","reason":"exit"}"#;
        let stop_failure = r#"{"hook_event_name":"StopFailure","session_id":"s","transcript_path":"","cwd":"","error_message":"oops"}"#;
        let session_start =
            r#"{"hook_event_name":"SessionStart","session_id":"s","transcript_path":"","cwd":""}"#;
        let notification = r#"{"hook_event_name":"Notification","session_id":"s","transcript_path":"","cwd":"","message":"hi","notification_type":"other"}"#;
        for (i, body) in [session_end, session_start, stop_failure, notification]
            .iter()
            .enumerate()
        {
            spool_event_file(dir.path(), tab_id, &format!("000{i}-x.json"), body);
        }

        let mut replayed = Vec::new();
        drain_spool(dir.path(), tab_id, |line| {
            if stale_spooled_event_kind(line).is_some() {
                return;
            }
            replayed.push(parse_payload(line).unwrap().event);
        });

        assert_eq!(replayed, vec!["SessionStart", "Notification"]);
    }

    #[test]
    fn parse_message_display_streaming() {
        let json = r#"{"hook_event_name":"MessageDisplay","session_id":"s","transcript_path":"","cwd":"","final":false,"delta":"chunk"}"#;
        let p = parse_payload(json).unwrap();
        assert!(!p.is_final);
    }
}

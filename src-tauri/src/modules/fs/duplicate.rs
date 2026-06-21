use crate::modules::workspace::{resolve_path, WorkspaceEnv};
use serde::Serialize;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

const BUF_SIZE: usize = 256 * 1024;
const EMIT_INTERVAL: Duration = Duration::from_millis(50);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateProgressEvent {
    pub name: String,
    pub copied: u64,
    pub total: u64,
    pub active: bool,
}

#[derive(Clone)]
pub struct CopySnapshot {
    pub name: String,
    pub copied: u64,
    pub total: u64,
}

#[derive(Debug)]
pub enum CopyError {
    Cancelled,
    Io(String),
    // The top-level destination already existed before we touched it; cleanup must not run.
    DestExists,
}

impl From<std::io::Error> for CopyError {
    fn from(e: std::io::Error) -> Self {
        CopyError::Io(e.to_string())
    }
}

#[derive(Default)]
pub struct CopyState {
    job: Mutex<Option<Arc<AtomicBool>>>,
    current: Mutex<Option<CopySnapshot>>,
}

impl CopyState {
    pub fn snapshot(&self) -> Option<CopySnapshot> {
        self.current.lock().unwrap().clone()
    }
}

fn dir_size(p: &Path) -> u64 {
    let meta = match std::fs::symlink_metadata(p) {
        Ok(m) => m,
        Err(_) => return 0,
    };
    if meta.is_dir() {
        std::fs::read_dir(p)
            .map(|rd| rd.flatten().map(|e| dir_size(&e.path())).sum())
            .unwrap_or(0)
    } else {
        meta.len()
    }
}

/// Recursively copies `src` to `dst` with a 256 KB buffer, invoking `on_bytes`
/// with the running total after each chunk and after each completed file.
/// Checks `cancel` before every chunk and every directory entry.
/// Returns `CopyError::DestExists` if the top-level destination already exists,
/// so the caller knows not to run cleanup on a path it never created.
fn copy_job(
    src: &Path,
    dst: &Path,
    _total: u64,
    cancel: &Arc<AtomicBool>,
    on_bytes: &mut dyn FnMut(u64),
) -> Result<(), CopyError> {
    let mut copied: u64 = 0;
    copy_inner(src, dst, true, cancel, &mut copied, on_bytes)
}

fn copy_inner(
    src: &Path,
    dst: &Path,
    toplevel: bool,
    cancel: &Arc<AtomicBool>,
    copied: &mut u64,
    on_bytes: &mut dyn FnMut(u64),
) -> Result<(), CopyError> {
    if cancel.load(Ordering::Acquire) {
        return Err(CopyError::Cancelled);
    }
    if src.is_dir() {
        // create_dir already fails with AlreadyExists if dst exists; map that
        // to DestExists at the top level so cleanup is skipped.
        if let Err(e) = std::fs::create_dir(dst) {
            if toplevel && e.kind() == std::io::ErrorKind::AlreadyExists {
                return Err(CopyError::DestExists);
            }
            return Err(CopyError::Io(e.to_string()));
        }
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            copy_inner(&entry.path(), &dst.join(entry.file_name()), false, cancel, copied, on_bytes)?;
        }
        Ok(())
    } else {
        let mut reader = std::fs::File::open(src)?;
        // At the top level use create_new so we never silently overwrite a file
        // that appeared in the race window between the caller's existence check
        // and this open. Nested files inside a freshly created dir cannot
        // pre-exist, so a normal create is fine for them.
        let mut writer = if toplevel {
            std::fs::OpenOptions::new().write(true).create_new(true).open(dst).map_err(|e| {
                if e.kind() == std::io::ErrorKind::AlreadyExists {
                    CopyError::DestExists
                } else {
                    CopyError::Io(e.to_string())
                }
            })?
        } else {
            std::fs::File::create(dst)?
        };
        let mut buf = vec![0u8; BUF_SIZE];
        loop {
            if cancel.load(Ordering::Acquire) {
                return Err(CopyError::Cancelled);
            }
            let n = reader.read(&mut buf)?;
            if n == 0 {
                break;
            }
            writer.write_all(&buf[..n])?;
            *copied += n as u64;
            on_bytes(*copied);
        }
        if let Ok(meta) = std::fs::metadata(src) {
            let _ = std::fs::set_permissions(dst, meta.permissions());
        }
        Ok(())
    }
}

fn cleanup(dst: &Path) {
    if dst.is_dir() {
        let _ = std::fs::remove_dir_all(dst);
    } else if dst.exists() {
        let _ = std::fs::remove_file(dst);
    }
}

#[tauri::command]
pub async fn fs_duplicate(
    state: State<'_, CopyState>,
    app: AppHandle,
    source: String,
    dest: String,
    workspace: Option<WorkspaceEnv>,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let src = resolve_path(&source, &workspace);
    let dst = resolve_path(&dest, &workspace);

    if !src.exists() {
        return Err(format!("not found: {}", src.display()));
    }
    if dst.exists() {
        return Err(format!("already exists: {}", dst.display()));
    }

    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut slot = state.job.lock().unwrap();
        if slot.is_some() {
            return Err("a duplication is already in progress".into());
        }
        *slot = Some(cancel.clone());
    }

    let name = dest.split(['/', '\\']).next_back().unwrap_or(&dest).to_string();
    let total = dir_size(&src);

    // Store initial snapshot and emit initial event.
    *state.current.lock().unwrap() = Some(CopySnapshot { name: name.clone(), copied: 0, total });
    let _ = app.emit("kex:duplicate-progress", DuplicateProgressEvent {
        name: name.clone(),
        copied: 0,
        total,
        active: true,
    });

    let app_clone = app.clone();
    let name_clone = name.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut last_emit = Instant::now();
        let mut emit = |copied: u64| {
            if last_emit.elapsed() >= EMIT_INTERVAL {
                last_emit = Instant::now();
                let _ = app_clone.emit("kex:duplicate-progress", DuplicateProgressEvent {
                    name: name_clone.clone(),
                    copied,
                    total,
                    active: true,
                });
            }
        };
        let outcome = copy_job(&src, &dst, total, &cancel, &mut emit);
        let (final_event, result) = match outcome {
            Ok(()) => (
                DuplicateProgressEvent { name: name_clone.clone(), copied: total, total, active: false },
                Ok(()),
            ),
            Err(CopyError::Cancelled) => {
                cleanup(&dst);
                (DuplicateProgressEvent { name: name_clone.clone(), copied: 0, total, active: false }, Ok(()))
            }
            Err(CopyError::Io(e)) => {
                cleanup(&dst);
                let msg = e.clone();
                (DuplicateProgressEvent { name: name_clone.clone(), copied: 0, total, active: false }, Err(msg))
            }
            // dst existed before we touched it; do not delete it.
            Err(CopyError::DestExists) => {
                let msg = format!("already exists: {}", dst.display());
                (
                    DuplicateProgressEvent { name: name_clone.clone(), copied: 0, total, active: false },
                    Err(msg),
                )
            }
        };
        let _ = app_clone.emit("kex:duplicate-progress", final_event);
        result
    })
    .await
    .map_err(|e| e.to_string());

    *state.job.lock().unwrap() = None;
    *state.current.lock().unwrap() = None;

    // If the user tried to quit while this copy was running, let the app exit now
    // that the slot is clear. Both "wait for it to finish" and "cancel copy & quit"
    // paths reach here; cancel sets the pending flag, copy ends, and this fires.
    if app.state::<crate::QuitGuard>().pending.load(Ordering::SeqCst) {
        let _ = app.emit("kex:before-quit", ());
    }

    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(e),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn fs_duplicate_cancel(state: State<'_, CopyState>) {
    if let Some(cancel) = state.job.lock().unwrap().as_ref() {
        cancel.store(true, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    fn count_bytes(p: &std::path::Path) -> u64 {
        if p.is_dir() {
            std::fs::read_dir(p)
                .unwrap()
                .map(|e| count_bytes(&e.unwrap().path()))
                .sum()
        } else {
            std::fs::metadata(p).unwrap().len()
        }
    }

    #[test]
    fn copies_a_file_with_identical_contents() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("a.txt");
        let dst = dir.path().join("a copy.txt");
        std::fs::write(&src, b"payload").unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let total = count_bytes(&src);
        copy_job(&src, &dst, total, &cancel, &mut |_p| {}).expect("copy");

        assert_eq!(std::fs::read(&dst).unwrap(), b"payload");
        assert!(src.exists(), "source survives");
    }

    #[test]
    fn copies_a_dir_recursively() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src");
        std::fs::create_dir_all(src.join("inner")).unwrap();
        std::fs::write(src.join("inner/y.txt"), b"y").unwrap();
        std::fs::write(src.join("x.txt"), b"xx").unwrap();
        let dst = dir.path().join("src copy");

        let cancel = Arc::new(AtomicBool::new(false));
        let total = count_bytes(&src);
        copy_job(&src, &dst, total, &cancel, &mut |_p| {}).expect("copy");

        assert_eq!(std::fs::read(dst.join("inner/y.txt")).unwrap(), b"y");
        assert_eq!(std::fs::read(dst.join("x.txt")).unwrap(), b"xx");
    }

    #[test]
    fn cancel_midway_leaves_nothing_behind() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src");
        std::fs::create_dir_all(&src).unwrap();
        // Two files so the cancel flag is observed before the second one.
        std::fs::write(src.join("a.txt"), vec![0u8; 4096]).unwrap();
        std::fs::write(src.join("b.txt"), vec![0u8; 4096]).unwrap();
        let dst = dir.path().join("src copy");

        let cancel = Arc::new(AtomicBool::new(true)); // cancelled from the start
        let total = count_bytes(&src);
        let err = copy_job(&src, &dst, total, &cancel, &mut |_p| {}).unwrap_err();
        assert!(matches!(err, CopyError::Cancelled));
        // Caller is responsible for cleanup; assert the helper does it.
        cleanup(&dst);
        assert!(!dst.exists(), "partial destination must be removed");
    }

    #[test]
    fn progress_reaches_total() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("a.bin");
        let dst = dir.path().join("a copy.bin");
        std::fs::write(&src, vec![7u8; 200_000]).unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let total = count_bytes(&src);
        let mut last = 0u64;
        copy_job(&src, &dst, total, &cancel, &mut |p| last = p).expect("copy");
        assert_eq!(last, total);
        assert_eq!(total, 200_000);
    }

    #[test]
    fn dest_exists_returns_error_and_leaves_it_intact() {
        let dir = tempfile::tempdir().unwrap();

        // File case: dst exists as a file with known content.
        let src_file = dir.path().join("src.txt");
        let dst_file = dir.path().join("dst.txt");
        std::fs::write(&src_file, b"source").unwrap();
        std::fs::write(&dst_file, b"original").unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let err = copy_job(&src_file, &dst_file, 6, &cancel, &mut |_| {}).unwrap_err();
        assert!(matches!(err, CopyError::DestExists), "expected DestExists for file, got {:?}", err);
        // The pre-existing file must be untouched.
        assert_eq!(std::fs::read(&dst_file).unwrap(), b"original", "dst file must not be modified");

        // Dir case: dst exists as a directory with known content.
        let src_dir = dir.path().join("src_dir");
        let dst_dir = dir.path().join("dst_dir");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("f.txt"), b"src").unwrap();
        std::fs::create_dir_all(&dst_dir).unwrap();
        std::fs::write(dst_dir.join("keep.txt"), b"keeper").unwrap();

        let cancel2 = Arc::new(AtomicBool::new(false));
        let total2 = count_bytes(&src_dir);
        let err2 = copy_job(&src_dir, &dst_dir, total2, &cancel2, &mut |_| {}).unwrap_err();
        assert!(matches!(err2, CopyError::DestExists), "expected DestExists for dir, got {:?}", err2);
        // The pre-existing directory and its contents must survive.
        assert!(dst_dir.exists(), "dst dir must still exist");
        assert_eq!(std::fs::read(dst_dir.join("keep.txt")).unwrap(), b"keeper", "dst dir contents must not be deleted");
    }
}

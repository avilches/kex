use crate::modules::workspace::{resolve_path, WorkspaceEnv};
use serde::Serialize;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tauri::State;

const BUF_SIZE: usize = 256 * 1024;
const EMIT_INTERVAL: Duration = Duration::from_millis(50);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyProgress {
    pub copied: u64,
    pub total: u64,
    pub done: bool,
    pub cancelled: bool,
    pub error: Option<String>,
}

#[derive(Debug)]
pub enum CopyError {
    Cancelled,
    Io(String),
}

impl From<std::io::Error> for CopyError {
    fn from(e: std::io::Error) -> Self {
        CopyError::Io(e.to_string())
    }
}

#[derive(Default)]
pub struct CopyState {
    job: Mutex<Option<Arc<AtomicBool>>>,
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
fn copy_job(
    src: &Path,
    dst: &Path,
    _total: u64,
    cancel: &Arc<AtomicBool>,
    on_bytes: &mut dyn FnMut(u64),
) -> Result<(), CopyError> {
    let mut copied: u64 = 0;
    copy_inner(src, dst, cancel, &mut copied, on_bytes)
}

fn copy_inner(
    src: &Path,
    dst: &Path,
    cancel: &Arc<AtomicBool>,
    copied: &mut u64,
    on_bytes: &mut dyn FnMut(u64),
) -> Result<(), CopyError> {
    if cancel.load(Ordering::Acquire) {
        return Err(CopyError::Cancelled);
    }
    if src.is_dir() {
        std::fs::create_dir(dst)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            copy_inner(&entry.path(), &dst.join(entry.file_name()), cancel, copied, on_bytes)?;
        }
        Ok(())
    } else {
        let mut reader = std::fs::File::open(src)?;
        let mut writer = std::fs::File::create(dst)?;
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
    source: String,
    dest: String,
    workspace: Option<WorkspaceEnv>,
    on_progress: Channel<CopyProgress>,
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

    let total = dir_size(&src);
    let _ = on_progress.send(CopyProgress {
        copied: 0,
        total,
        done: false,
        cancelled: false,
        error: None,
    });

    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut last_emit = Instant::now();
        let mut emit = |copied: u64| {
            if last_emit.elapsed() >= EMIT_INTERVAL {
                last_emit = Instant::now();
                let _ = on_progress.send(CopyProgress {
                    copied,
                    total,
                    done: false,
                    cancelled: false,
                    error: None,
                });
            }
        };
        let outcome = copy_job(&src, &dst, total, &cancel, &mut emit);
        let final_progress = match &outcome {
            Ok(()) => CopyProgress { copied: total, total, done: true, cancelled: false, error: None },
            Err(CopyError::Cancelled) => {
                cleanup(&dst);
                CopyProgress { copied: 0, total, done: true, cancelled: true, error: None }
            }
            Err(CopyError::Io(e)) => {
                cleanup(&dst);
                CopyProgress { copied: 0, total, done: true, cancelled: false, error: Some(e.clone()) }
            }
        };
        let _ = on_progress.send(final_progress);
        outcome
    })
    .await
    .map_err(|e| e.to_string());

    *state.job.lock().unwrap() = None;

    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(CopyError::Cancelled)) => Ok(()),
        Ok(Err(CopyError::Io(e))) => Err(e),
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
}

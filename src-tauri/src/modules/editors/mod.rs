pub mod agents;
pub mod catalog;
pub mod detect;

use detect::DetectedEditor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

static STARTUP_SCAN_CLAIMED: AtomicBool = AtomicBool::new(false);
// Two windows scanning at once would each start a login shell for the agent PATH probe.
static SCAN_LOCK: Mutex<()> = Mutex::new(());

fn claim_once(flag: &AtomicBool) -> bool {
    !flag.swap(true, Ordering::AcqRel)
}

/// True only for the first caller in this app process, so a launch that restores several
/// windows runs one startup scan; the others get its results through the preferences echo.
#[tauri::command]
pub fn claim_startup_scan() -> bool {
    claim_once(&STARTUP_SCAN_CLAIMED)
}

fn detect_serialized() -> Vec<DetectedEditor> {
    let _guard = SCAN_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    detect::detect_all()
}

/// Scans the system for installed editors and returns those found.
/// Runs detection synchronously on a blocking thread to avoid blocking the async runtime.
#[tauri::command]
pub async fn editor_scan() -> Result<Vec<DetectedEditor>, String> {
    tauri::async_runtime::spawn_blocking(detect_serialized)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_startup_scan_is_claimed_only_once() {
        let flag = AtomicBool::new(false);
        assert!(claim_once(&flag));
        assert!(!claim_once(&flag));
        assert!(!claim_once(&flag));
    }

    #[test]
    fn concurrent_claims_have_exactly_one_winner() {
        let flag = std::sync::Arc::new(AtomicBool::new(false));
        let winners: usize = (0..8)
            .map(|_| {
                let flag = flag.clone();
                std::thread::spawn(move || claim_once(&flag))
            })
            .map(|h| usize::from(h.join().unwrap()))
            .sum();
        assert_eq!(winners, 1);
    }
}

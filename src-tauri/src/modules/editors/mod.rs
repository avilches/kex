pub mod agents;
pub mod catalog;
pub mod detect;

use detect::DetectedEditor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

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

// Seeding writes the Actions and the seen lists from a plan made on what the window knows, so two
// windows seeding at once would each add the same agents. One holds this lease at a time. It
// expires, so a window that dies in the middle cannot block the seeding for the rest of the launch.
static SEED_LEASE: Mutex<Option<Instant>> = Mutex::new(None);
const SEED_LEASE_TTL: Duration = Duration::from_secs(60);

fn lease_take(lease: &Mutex<Option<Instant>>, now: Instant, ttl: Duration) -> bool {
    let mut held = lease.lock().unwrap_or_else(|e| e.into_inner());
    match *held {
        Some(since) if now.saturating_duration_since(since) < ttl => false,
        _ => {
            *held = Some(now);
            true
        }
    }
}

fn lease_release(lease: &Mutex<Option<Instant>>) {
    *lease.lock().unwrap_or_else(|e| e.into_inner()) = None;
}

/// True when the caller may seed the Actions now; false while another window does.
#[tauri::command]
pub fn claim_seed_lease() -> bool {
    lease_take(&SEED_LEASE, Instant::now(), SEED_LEASE_TTL)
}

#[tauri::command]
pub fn release_seed_lease() {
    lease_release(&SEED_LEASE);
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
    fn the_seed_lease_is_held_by_one_caller_until_released_or_expired() {
        let lease = Mutex::new(None);
        let start = Instant::now();
        let ttl = Duration::from_secs(60);
        assert!(lease_take(&lease, start, ttl));
        assert!(!lease_take(&lease, start + Duration::from_secs(1), ttl));
        lease_release(&lease);
        assert!(lease_take(&lease, start + Duration::from_secs(2), ttl));
        assert!(!lease_take(&lease, start + Duration::from_secs(30), ttl));
        assert!(lease_take(&lease, start + Duration::from_secs(63), ttl));
    }

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

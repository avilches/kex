use std::sync::atomic::{AtomicBool, Ordering};

static AUTO_CHECK_CLAIMED: AtomicBool = AtomicBool::new(false);
static INSTALL_RUNNING: AtomicBool = AtomicBool::new(false);

fn claim(flag: &AtomicBool) -> bool {
    !flag.swap(true, Ordering::AcqRel)
}

/// True only for the first window of this process, so a launch that restores several windows
/// makes one update request and shows one dialog. Manual checks do not go through it.
#[tauri::command]
pub fn claim_update_check() -> bool {
    claim(&AUTO_CHECK_CLAIMED)
}

/// True when no install is running in any window; the caller must `release_update_install`
/// if the install fails, otherwise the app relaunches.
#[tauri::command]
pub fn claim_update_install() -> bool {
    claim(&INSTALL_RUNNING)
}

#[tauri::command]
pub fn release_update_install() {
    INSTALL_RUNNING.store(false, Ordering::Release);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_first_claim_wins() {
        let flag = AtomicBool::new(false);
        assert!(claim(&flag));
        assert!(!claim(&flag));
    }

    #[test]
    fn concurrent_claims_have_exactly_one_winner() {
        let flag = std::sync::Arc::new(AtomicBool::new(false));
        let winners: usize = (0..8)
            .map(|_| {
                let flag = flag.clone();
                std::thread::spawn(move || claim(&flag))
            })
            .map(|h| usize::from(h.join().unwrap()))
            .sum();
        assert_eq!(winners, 1);
    }

    #[test]
    fn a_failed_install_can_be_retried() {
        assert!(claim_update_install());
        assert!(!claim_update_install());
        release_update_install();
        assert!(claim_update_install());
        release_update_install();
    }
}

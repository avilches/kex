use std::sync::atomic::{AtomicBool, Ordering};

static STARTUP_CLAIMED: AtomicBool = AtomicBool::new(false);

fn claim(flag: &AtomicBool) -> bool {
    !flag.swap(true, Ordering::AcqRel)
}

/// True only for the first main window of this process, so a launch that restores several
/// windows (or a window opened later) never opens the onboarding or its reminder twice.
#[tauri::command]
pub fn claim_onboarding_startup() -> bool {
    claim(&STARTUP_CLAIMED)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_first_claim_wins() {
        assert!(claim_onboarding_startup());
        assert!(!claim_onboarding_startup());
        assert!(!claim_onboarding_startup());
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
}

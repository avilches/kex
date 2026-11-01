use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

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

/// The main windows whose onboarding dialog is open. While any is, no new window opens, so
/// two onboardings never run at once.
#[derive(Default)]
pub struct OnboardingBlock(Mutex<HashSet<String>>);

impl OnboardingBlock {
    /// Records the dialog of `label` as open or closed and returns whether the block as a whole
    /// changed (none open before and one now, or the other way round).
    pub fn set(&self, label: &str, open: bool) -> bool {
        let mut open_in = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let was = !open_in.is_empty();
        if open {
            open_in.insert(label.to_string());
        } else {
            open_in.remove(label);
        }
        let now = !open_in.is_empty();
        was != now
    }

    pub fn active(&self) -> bool {
        !self.0.lock().unwrap_or_else(|e| e.into_inner()).is_empty()
    }
}

/// The calling window says its onboarding dialog opened or closed. A window that goes away
/// with the dialog open is released from `WindowEvent::Destroyed`.
#[tauri::command]
pub fn set_onboarding_open(app: tauri::AppHandle, window: tauri::WebviewWindow, open: bool) {
    use tauri::Manager;
    if app.state::<OnboardingBlock>().set(window.label(), open) {
        crate::onboarding_block_changed(&app);
    }
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

    #[test]
    fn an_open_dialog_blocks_and_closing_it_releases() {
        let block = OnboardingBlock::default();
        assert!(!block.active());
        assert!(block.set("w-a", true));
        assert!(block.active());
        assert!(block.set("w-a", false));
        assert!(!block.active());
    }

    #[test]
    fn the_block_lasts_while_any_window_has_it_open() {
        let block = OnboardingBlock::default();
        assert!(block.set("w-a", true));
        assert!(!block.set("w-b", true));
        assert!(!block.set("w-a", false));
        assert!(block.active());
        assert!(block.set("w-b", false));
        assert!(!block.active());
    }

    #[test]
    fn repeated_signals_do_not_count_twice() {
        let block = OnboardingBlock::default();
        assert!(block.set("w-a", true));
        assert!(!block.set("w-a", true));
        assert!(block.set("w-a", false));
        assert!(!block.set("w-a", false));
        assert!(!block.active());
    }

    #[test]
    fn closing_a_window_that_never_opened_it_changes_nothing() {
        let block = OnboardingBlock::default();
        assert!(!block.set("w-a", false));
        assert!(!block.active());
    }
}

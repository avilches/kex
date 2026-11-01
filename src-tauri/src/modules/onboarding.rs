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

/// The main window whose onboarding dialog is open, if any. Only one window holds it, so two
/// onboardings never run at once; while it is held no new window and no Settings window opens.
#[derive(Default)]
pub struct OnboardingBlock(Mutex<Option<String>>);

impl OnboardingBlock {
    /// Gives the block to `label` unless another window holds it. `Some(changed)` when `label`
    /// holds it now (`changed` is false when it already did), `None` when another window does.
    pub fn take(&self, label: &str) -> Option<bool> {
        let mut holder = self.0.lock().unwrap_or_else(|e| e.into_inner());
        match holder.as_deref() {
            Some(h) if h == label => Some(false),
            Some(_) => None,
            None => {
                *holder = Some(label.to_string());
                Some(true)
            }
        }
    }

    /// Frees the block when `label` holds it; returns whether it was freed.
    pub fn release(&self, label: &str) -> bool {
        let mut holder = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if holder.as_deref() == Some(label) {
            *holder = None;
            true
        } else {
            false
        }
    }

    pub fn active(&self) -> bool {
        self.holder().is_some()
    }

    pub fn holder(&self) -> Option<String> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

pub const BLOCK_EVENT: &str = "kex:onboarding-block";

#[derive(Clone, serde::Serialize)]
pub struct BlockPayload {
    holder: Option<String>,
}

pub fn block_payload(block: &OnboardingBlock) -> BlockPayload {
    BlockPayload {
        holder: block.holder(),
    }
}

/// Which window holds the onboarding dialog right now, for a window that opens or reloads while
/// another already has it and so missed the event announcing it.
#[tauri::command]
pub fn onboarding_block_holder(app: tauri::AppHandle) -> BlockPayload {
    use tauri::Manager;
    block_payload(&app.state::<OnboardingBlock>())
}

/// The calling window asks to open its onboarding dialog (`open`) or says it closed. Opening
/// answers whether the window got the block; when another window holds it, that window is
/// brought to the front instead. Closing always answers true. A window that goes away with the
/// dialog open is released from `WindowEvent::Destroyed`.
#[tauri::command]
pub fn set_onboarding_open(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    open: bool,
) -> bool {
    use tauri::Manager;
    let block = app.state::<OnboardingBlock>();
    if !open {
        if block.release(window.label()) {
            crate::onboarding_block_changed(&app);
        }
        return true;
    }
    match block.take(window.label()) {
        Some(changed) => {
            if changed {
                crate::onboarding_block_changed(&app);
            }
            true
        }
        None => {
            crate::focus_onboarding_holder(&app);
            false
        }
    }
}

/// The main window that "Run onboarding again" in Settings speaks to: the one used last if it
/// is still open, otherwise any open one.
pub fn restart_target(last_focused: Option<String>, live: &[String]) -> Option<String> {
    last_focused
        .filter(|l| live.contains(l))
        .or_else(|| live.first().cloned())
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
    fn the_first_window_takes_the_block_and_its_release_frees_it() {
        let block = OnboardingBlock::default();
        assert!(!block.active());
        assert_eq!(block.take("w-a"), Some(true));
        assert!(block.active());
        assert!(block.release("w-a"));
        assert!(!block.active());
    }

    #[test]
    fn a_second_window_cannot_take_a_held_block() {
        let block = OnboardingBlock::default();
        assert_eq!(block.take("w-a"), Some(true));
        assert_eq!(block.take("w-b"), None);
        assert_eq!(block.holder().as_deref(), Some("w-a"));
    }

    #[test]
    fn the_holder_taking_it_again_is_idempotent() {
        let block = OnboardingBlock::default();
        assert_eq!(block.take("w-a"), Some(true));
        assert_eq!(block.take("w-a"), Some(false));
        assert!(block.release("w-a"));
        assert!(!block.release("w-a"));
        assert!(!block.active());
    }

    #[test]
    fn a_release_by_another_window_does_not_free_it() {
        let block = OnboardingBlock::default();
        assert_eq!(block.take("w-a"), Some(true));
        assert!(!block.release("w-b"));
        assert_eq!(block.holder().as_deref(), Some("w-a"));
    }

    #[test]
    fn once_freed_another_window_can_take_it() {
        let block = OnboardingBlock::default();
        assert_eq!(block.take("w-a"), Some(true));
        assert!(block.release("w-a"));
        assert_eq!(block.take("w-b"), Some(true));
    }

    #[test]
    fn the_block_payload_names_the_holder_or_nothing() {
        let block = OnboardingBlock::default();
        assert_eq!(
            serde_json::to_value(block_payload(&block)).unwrap(),
            serde_json::json!({ "holder": null })
        );
        block.take("w-a");
        assert_eq!(
            serde_json::to_value(block_payload(&block)).unwrap(),
            serde_json::json!({ "holder": "w-a" })
        );
        block.release("w-a");
        assert_eq!(
            serde_json::to_value(block_payload(&block)).unwrap(),
            serde_json::json!({ "holder": null })
        );
    }

    #[test]
    fn restart_goes_to_the_last_used_window_while_it_is_open() {
        let live = vec!["w-a".to_string(), "w-b".to_string()];
        assert_eq!(
            restart_target(Some("w-b".into()), &live).as_deref(),
            Some("w-b")
        );
        assert_eq!(
            restart_target(Some("w-gone".into()), &live).as_deref(),
            Some("w-a")
        );
        assert_eq!(restart_target(None, &live).as_deref(), Some("w-a"));
        assert_eq!(restart_target(Some("w-a".into()), &[]), None);
    }
}

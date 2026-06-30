use std::sync::Mutex;
use std::time::{Duration, Instant};

const NAV_TTL: Duration = Duration::from_secs(5);

pub struct PendingNav {
    pub window_label: String,
    pub workspace_id: String,
    pub tab_id: String,
    queued_at: Instant,
}

#[derive(Default)]
pub struct PendingNavState(Mutex<Option<PendingNav>>);

impl PendingNavState {
    pub fn store(&self, window_label: String, workspace_id: String, tab_id: String) {
        *self.0.lock().unwrap() = Some(PendingNav {
            window_label,
            workspace_id,
            tab_id,
            queued_at: Instant::now(),
        });
    }

    /// Takes the pending nav only if it was stored within the last 5 seconds.
    /// Stale or absent entries are discarded and None is returned.
    pub fn take_if_fresh(&self) -> Option<PendingNav> {
        let mut guard = self.0.lock().unwrap();
        match &*guard {
            Some(n) if n.queued_at.elapsed() < NAV_TTL => guard.take(),
            _ => {
                *guard = None;
                None
            }
        }
    }
}

#[tauri::command]
pub fn agent_queue_nav(
    state: tauri::State<'_, PendingNavState>,
    window_label: String,
    workspace_id: String,
    tab_id: String,
) {
    state.store(window_label, workspace_id, tab_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn take_if_fresh_returns_nav_when_present() {
        let state = PendingNavState::default();
        state.store("w-1".into(), "ws-a".into(), "p-b".into());
        let nav = state.take_if_fresh().expect("should be Some");
        assert_eq!(nav.window_label, "w-1");
        assert_eq!(nav.workspace_id, "ws-a");
        assert_eq!(nav.tab_id, "p-b");
    }

    #[test]
    fn take_if_fresh_returns_none_when_empty() {
        let state = PendingNavState::default();
        assert!(state.take_if_fresh().is_none());
    }

    #[test]
    fn take_clears_the_entry_so_second_take_is_none() {
        let state = PendingNavState::default();
        state.store("w-1".into(), "ws-a".into(), "p-b".into());
        state.take_if_fresh();
        assert!(state.take_if_fresh().is_none());
    }

    #[test]
    fn store_overwrites_previous_entry() {
        let state = PendingNavState::default();
        state.store("w-1".into(), "ws-a".into(), "p-b".into());
        state.store("w-2".into(), "ws-c".into(), "p-d".into());
        let nav = state.take_if_fresh().expect("should be Some");
        assert_eq!(nav.window_label, "w-2");
    }
}

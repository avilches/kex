//! Which tab a hook frame belongs to. Nothing here knows the transport: the Unix socket server
//! in `ipc.rs` (and a future Windows one) feeds lines in and acts on the `Route` that comes out.

use std::collections::HashMap;

/// True for ids made of the `nid()` alphabet. The id names a spool directory, so anything else
/// (empty, `..`, a separator, an absolute path) could reach outside it.
pub fn is_safe_tab_id(tab_id: &str) -> bool {
    (1..=64).contains(&tab_id.len())
        && tab_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// The PTY each tab runs on. A tab keeps its id across PTY restarts, so the entry is replaced,
/// never duplicated. A PTY is registered before its child starts but only becomes the tab's
/// live one once the spawn succeeded (`activate`): until then its tab's frames are spooled, so
/// a spawn that fails never consumes them.
#[derive(Default)]
pub struct TabRegistry {
    tabs: HashMap<String, Entry>,
}

#[derive(Clone, Copy, PartialEq)]
struct Entry {
    pty_id: u32,
    live: bool,
}

impl TabRegistry {
    pub fn register(&mut self, tab_id: &str, pty_id: u32) {
        self.tabs.insert(
            tab_id.to_string(),
            Entry {
                pty_id,
                live: false,
            },
        );
    }

    /// True when `pty_id` is still the tab's PTY and is now live.
    pub fn activate(&mut self, tab_id: &str, pty_id: u32) -> bool {
        match self.tabs.get_mut(tab_id) {
            Some(e) if e.pty_id == pty_id => {
                e.live = true;
                true
            }
            _ => false,
        }
    }

    /// Only the PTY that owns the entry may remove it: a restarted tab can register its new
    /// PTY before the old one is dropped.
    pub fn unregister(&mut self, tab_id: &str, pty_id: u32) {
        if self.tabs.get(tab_id).is_some_and(|e| e.pty_id == pty_id) {
            self.tabs.remove(tab_id);
        }
    }

    /// The tab's live PTY; a pending one does not count.
    pub fn current(&self, tab_id: &str) -> Option<u32> {
        self.tabs.get(tab_id).filter(|e| e.live).map(|e| e.pty_id)
    }
}

/// Events of an agent that are dropped when they arrive from a PTY the tab no longer runs on.
/// `SessionStart` and `UserPromptSubmit` would rewrite the session record and status of the
/// agent running there now (a `--resume` of the same session, for instance), and `SessionEnd`
/// and `StopFailure` would end it. A `StatusLine` reading of the old agent would misreport the
/// new one.
pub fn late_frame_is_dropped(event: &str) -> bool {
    matches!(
        event,
        "SessionStart" | "UserPromptSubmit" | "SessionEnd" | "StopFailure" | "StatusLine"
    )
}

/// The tab and PTY a frame says it comes from, as the sender's environment fixed them
/// (`KEX_TAB_ID`, `KEX_PTY_ID`).
#[derive(Debug, PartialEq)]
pub struct FrameOrigin {
    pub tab_id: Option<String>,
    pub pty_id: Option<u32>,
}

/// `pty_id` arrives as a string from the shell script (`jq --arg`) and may be a number from a
/// plugin; anything that is not a u32 counts as absent.
pub fn frame_origin(json: &str) -> FrameOrigin {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(json) else {
        return FrameOrigin {
            tab_id: None,
            pty_id: None,
        };
    };
    let pty_id = match &v["pty_id"] {
        serde_json::Value::String(s) => s.parse().ok(),
        serde_json::Value::Number(n) => n.as_u64().and_then(|n| u32::try_from(n).ok()),
        _ => None,
    };
    FrameOrigin {
        tab_id: v["tab_id"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        pty_id,
    }
}

#[derive(Debug, PartialEq)]
pub enum Route {
    /// Sent by a process of the tab's current PTY.
    Live {
        tab_id: String,
        pty_id: u32,
    },
    /// Sent by a process of a PTY the tab no longer runs on: delivered to the current one minus
    /// the events of `late_frame_is_dropped`.
    Late {
        tab_id: String,
        pty_id: u32,
    },
    /// No live PTY of this instance runs the tab right now (closed, hibernated, restarting, or
    /// its new PTY is still spawning): kept on disk until a PTY of the tab goes live.
    Spool {
        tab_id: String,
    },
    Reject(&'static str),
}

pub fn route(origin: &FrameOrigin, current: impl Fn(&str) -> Option<u32>) -> Route {
    let Some(tab_id) = origin.tab_id.as_deref() else {
        return Route::Reject("frame has no tab_id");
    };
    if !is_safe_tab_id(tab_id) {
        return Route::Reject("frame has an unsafe tab_id");
    }
    let tab_id = tab_id.to_string();
    match (current(&tab_id), origin.pty_id) {
        (None, _) => Route::Spool { tab_id },
        (Some(now), Some(sent)) if sent != now => Route::Late {
            tab_id,
            pty_id: now,
        },
        (Some(now), _) => Route::Live {
            tab_id,
            pty_id: now,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn origin(tab: Option<&str>, pty: Option<u32>) -> FrameOrigin {
        FrameOrigin {
            tab_id: tab.map(str::to_string),
            pty_id: pty,
        }
    }

    #[test]
    fn is_safe_tab_id_accepts_only_the_nid_alphabet() {
        assert!(is_safe_tab_id("tab-abc_123"));
        assert!(is_safe_tab_id(&"a".repeat(64)));
        for bad in [
            "",
            "..",
            ".",
            "a/b",
            "../x",
            "/etc",
            "a b",
            "a.b",
            &"a".repeat(65),
        ] {
            assert!(!is_safe_tab_id(bad), "{bad:?}");
        }
    }

    #[test]
    fn frame_origin_reads_the_tab_and_a_string_or_numeric_pty() {
        assert_eq!(
            frame_origin(r#"{"tab_id":"tab-a","pty_id":"7"}"#),
            origin(Some("tab-a"), Some(7))
        );
        assert_eq!(
            frame_origin(r#"{"tab_id":"tab-a","pty_id":7}"#),
            origin(Some("tab-a"), Some(7))
        );
    }

    #[test]
    fn frame_origin_treats_empty_or_malformed_fields_as_absent() {
        assert_eq!(
            frame_origin(r#"{"tab_id":"","pty_id":""}"#),
            origin(None, None)
        );
        assert_eq!(
            frame_origin(r#"{"tab_id":"t","pty_id":"-1"}"#),
            origin(Some("t"), None)
        );
        assert_eq!(
            frame_origin(r#"{"tab_id":"t","pty_id":4294967296}"#),
            origin(Some("t"), None)
        );
        assert_eq!(frame_origin("not json"), origin(None, None));
        assert_eq!(frame_origin(r#"{"tab_id":5}"#), origin(None, None));
    }

    #[test]
    fn a_frame_without_a_safe_tab_is_rejected() {
        let none = |_: &str| Some(1);
        assert!(matches!(
            route(&origin(None, Some(1)), none),
            Route::Reject(_)
        ));
        for bad in ["..", "a/b", "/etc"] {
            assert!(matches!(
                route(&origin(Some(bad), None), none),
                Route::Reject(_)
            ));
        }
    }

    #[test]
    fn a_frame_from_the_current_pty_or_without_a_pty_is_live() {
        let current = |t: &str| (t == "tab-a").then_some(3);
        assert_eq!(
            route(&origin(Some("tab-a"), Some(3)), current),
            Route::Live {
                tab_id: "tab-a".into(),
                pty_id: 3
            }
        );
        assert_eq!(
            route(&origin(Some("tab-a"), None), current),
            Route::Live {
                tab_id: "tab-a".into(),
                pty_id: 3
            }
        );
    }

    #[test]
    fn a_frame_from_a_previous_pty_of_the_tab_is_late_on_the_current_one() {
        let current = |_: &str| Some(9);
        assert_eq!(
            route(&origin(Some("tab-a"), Some(3)), current),
            Route::Late {
                tab_id: "tab-a".into(),
                pty_id: 9
            }
        );
    }

    #[test]
    fn a_frame_for_a_tab_with_no_pty_is_spooled() {
        assert_eq!(
            route(&origin(Some("tab-a"), Some(3)), |_| None),
            Route::Spool {
                tab_id: "tab-a".into()
            }
        );
    }

    #[test]
    fn the_route_never_borrows_another_tabs_pty() {
        let mut reg = TabRegistry::default();
        reg.register("tab-a", 1);
        reg.register("tab-b", 2);
        reg.activate("tab-a", 1);
        reg.activate("tab-b", 2);
        assert_eq!(
            route(&origin(Some("tab-b"), Some(1)), |t| reg.current(t)),
            Route::Late {
                tab_id: "tab-b".into(),
                pty_id: 2
            }
        );
    }

    #[test]
    fn unregister_leaves_a_newer_pty_of_the_same_tab_alone() {
        let mut reg = TabRegistry::default();
        reg.register("tab-a", 1);
        reg.register("tab-a", 2);
        reg.activate("tab-a", 2);
        reg.unregister("tab-a", 1);
        assert_eq!(reg.current("tab-a"), Some(2));
        reg.unregister("tab-a", 2);
        assert_eq!(reg.current("tab-a"), None);
    }

    #[test]
    fn a_registered_pty_is_not_live_until_activated() {
        let mut reg = TabRegistry::default();
        reg.register("tab-a", 1);
        assert_eq!(reg.current("tab-a"), None);
        assert!(
            !reg.activate("tab-a", 9),
            "another PTY cannot activate the entry"
        );
        assert!(reg.activate("tab-a", 1));
        assert_eq!(reg.current("tab-a"), Some(1));
    }

    #[test]
    fn a_restart_leaves_the_tab_pending_until_the_new_pty_is_live() {
        let mut reg = TabRegistry::default();
        reg.register("tab-a", 1);
        reg.activate("tab-a", 1);
        reg.register("tab-a", 2);
        assert_eq!(reg.current("tab-a"), None);
        assert!(!reg.activate("tab-a", 1));
        assert!(reg.activate("tab-a", 2));
        assert_eq!(reg.current("tab-a"), Some(2));
    }

    #[test]
    fn late_frames_that_would_rewrite_or_end_the_new_session_are_dropped() {
        for e in [
            "SessionStart",
            "UserPromptSubmit",
            "SessionEnd",
            "StopFailure",
            "StatusLine",
        ] {
            assert!(late_frame_is_dropped(e), "{e}");
        }
        for e in [
            "Stop",
            "Notification",
            "PermissionRequest",
            "SubagentStop",
            "PostCompact",
        ] {
            assert!(!late_frame_is_dropped(e), "{e}");
        }
    }
}

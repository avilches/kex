use tauri::{Window, WindowEvent};

/// Lifecycle events only. Resized and Moved fire continuously and would drown the log.
pub fn describe(label: &str, event: &WindowEvent) -> Option<String> {
    match event {
        WindowEvent::CloseRequested { .. } => Some(format!("[window] {label} close requested")),
        WindowEvent::Destroyed => Some(format!("[window] {label} destroyed")),
        WindowEvent::Focused(focused) => Some(format!("[window] {label} focused={focused}")),
        _ => None,
    }
}

/// Host only: a float browser URL can carry tokens in its path or query.
pub fn describe_created(label: &str, kind: &str, host: Option<&str>) -> String {
    match host {
        Some(host) => format!("[window] {label} created kind={kind} host={host}"),
        None => format!("[window] {label} created kind={kind}"),
    }
}

/// A WebKit crash kills the process before JS can say anything, so the only way to know which
/// window was opened or closed just before it is to write every lifecycle event as it happens.
pub fn record(window: &Window, event: &WindowEvent) {
    if let Some(line) = describe(window.label(), event) {
        log::info!("{line}");
    }
}

#[cfg(test)]
mod tests {
    use super::{describe, describe_created};
    use tauri::{PhysicalSize, WindowEvent};

    #[test]
    fn names_the_window_and_the_lifecycle_event() {
        assert_eq!(
            describe("settings", &WindowEvent::Destroyed).as_deref(),
            Some("[window] settings destroyed")
        );
        assert_eq!(
            describe("float-tab-1", &WindowEvent::Focused(false)).as_deref(),
            Some("[window] float-tab-1 focused=false")
        );
    }

    #[test]
    fn ignores_events_that_fire_continuously() {
        assert_eq!(
            describe("w-1", &WindowEvent::Resized(PhysicalSize::new(10, 10))),
            None
        );
    }

    #[test]
    fn created_line_keeps_the_host_and_drops_the_path() {
        assert_eq!(
            describe_created("float-tab-1", "float-browser", Some("example.com")),
            "[window] float-tab-1 created kind=float-browser host=example.com"
        );
        assert_eq!(
            describe_created("settings", "settings", None),
            "[window] settings created kind=settings"
        );
    }
}

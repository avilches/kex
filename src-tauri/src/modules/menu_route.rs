#[derive(Debug, PartialEq, Eq)]
pub enum MenuRoute {
    Quit,
    CloseSettings,
    Ignore,
    Forward,
}

/// While Settings has focus, only Quit, Close Tab (which closes Settings) and the
/// items that never touch a main window keep working; the rest would land on a
/// main window hidden behind it.
pub fn route_menu_event(settings_focused: bool, id: &str) -> MenuRoute {
    if id == "quit" {
        return MenuRoute::Quit;
    }
    if !settings_focused {
        return MenuRoute::Forward;
    }
    match id {
        "close_tab" => MenuRoute::CloseSettings,
        "new_window" | "dock_browser" | "dock_all_browsers" => MenuRoute::Forward,
        _ => MenuRoute::Ignore,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quit_always_quits() {
        assert_eq!(route_menu_event(true, "quit"), MenuRoute::Quit);
        assert_eq!(route_menu_event(false, "quit"), MenuRoute::Quit);
    }

    #[test]
    fn settings_focused_close_tab_closes_settings() {
        assert_eq!(route_menu_event(true, "close_tab"), MenuRoute::CloseSettings);
    }

    #[test]
    fn settings_focused_ignores_items_that_target_the_main_window() {
        for id in [
            "settings",
            "new_workspace",
            "new_terminal",
            "new_browser",
            "toggle_autosave",
            "close_others",
            "close_all",
            "toggle_sidebar",
            "toggle_explorer",
            "toggle_git",
            "toggle_history",
            "toggle_hidden",
            "toggle_sidebar_side",
            "anything_else",
        ] {
            assert_eq!(route_menu_event(true, id), MenuRoute::Ignore, "{id}");
        }
    }

    #[test]
    fn settings_focused_keeps_window_level_items() {
        for id in ["new_window", "dock_browser", "dock_all_browsers"] {
            assert_eq!(route_menu_event(true, id), MenuRoute::Forward, "{id}");
        }
    }

    #[test]
    fn settings_not_focused_forwards_everything_else() {
        for id in ["close_tab", "settings", "new_window", "toggle_git"] {
            assert_eq!(route_menu_event(false, id), MenuRoute::Forward, "{id}");
        }
    }
}

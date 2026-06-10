# Pending work

## Tab bar style setting

Two tab bar styles are implemented and persisted via `tabBarStyle` in `terax-settings.json`:

- `"connected"` (default): tabs flush to the panel below, shared divider lines, active tab blends into the panel content area with a focus accent line.
- `"pill"`: original floating pill style, active tab highlighted with a distinct background.

The preference is stored and reacts live, but there is no option exposed in the Settings window yet. To switch manually, call `setTabBarStyle("pill")` or `setTabBarStyle("connected")` from `src/modules/settings/store.ts`.

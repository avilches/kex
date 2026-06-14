import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/cyrillic-400.css";
import "@fontsource/jetbrains-mono/cyrillic-700.css";
import "@xterm/xterm/css/xterm.css";
import "./styles/globals.css";

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { initLaunchDir } from "./lib/launchDir";
import { USE_CUSTOM_WINDOW_CONTROLS } from "./lib/platform";
import { loadPreferences } from "./modules/settings/store";
import { flushWorkspaceState, initWorkspaceState } from "./modules/workspaces/lib/workspaceState";
import { retryMissingWebgl } from "./modules/terminal/lib/rendererPool";

if (USE_CUSTOM_WINDOW_CONTROLS) {
  document.documentElement.dataset.chrome = "borderless";
}

// Render-instrumentation overlay, opt-in: `VITE_REACT_SCAN=true pnpm dev`.
// Dev-only dynamic import so it never reaches the production bundle.
if (import.meta.env.DEV && import.meta.env.VITE_REACT_SCAN === "true") {
  const { scan } = await import("react-scan");
  scan({ enabled: true });
}

// Reap PTY sessions orphaned by a prior webview load before any tab spawns.
await invoke("pty_close_all").catch(() => {});

// Seed before first paint so default tab mounts at target cwd (no flicker).
await initLaunchDir();
// Load saved workspace layout for session restore.
await initWorkspaceState();

// Auto-reinstall Claude Code hooks if the user had enabled them previously.
// agent_enable_claude_hooks is idempotent: only touches the script/settings
// when the installed version is outdated or our hooks are missing.
loadPreferences().then((prefs) => {
  if (prefs.claudeHooksEnabled) {
    invoke("agent_enable_claude_hooks").catch(() => {});
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);

// Restore window geometry (position + size) before showing.
// Called here (on_window_ready equivalent) using physical pixels, matching
// tauri-plugin-window-state behaviour which proved correct on macOS.
await invoke("restore_window_geometry").catch(() => {});

// Window starts hidden (per tauri.conf.json) so users never see a transparent
// shadow-only frame before React paints. Use setTimeout — rAF is throttled
// while the window is hidden and would never fire.
const showWindow = () => {
  getCurrentWindow()
    .show()
    .catch((e) => console.error("window.show failed:", e));
};
setTimeout(showWindow, 50);
// Safety net: if the first show somehow fails to take effect, force again.
setTimeout(showWindow, 500);
// At t=350ms the window has been visible for ~300ms -- enough for WKWebView's GPU
// surface to initialize. Retries slots that missed WebGL at startup (rAFs throttled
// while the window was hidden, GPU surface not yet ready at first scheduleUnhide).
setTimeout(retryMissingWebgl, 350);

// Flush pending workspace state before the window closes so the 800ms debounce
// never loses changes. We prevent the close, save, then destroy the window
// directly (bypasses closeRequested so there is no re-entrancy issue).
let flushing = false;
getCurrentWindow().onCloseRequested(async (event) => {
  if (flushing) return;
  event.preventDefault();
  flushing = true;
  try {
    await flushWorkspaceState();
    await getCurrentWindow().destroy();
  } catch {
    flushing = false;
  }
});

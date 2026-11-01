import "@xterm/xterm/css/xterm.css";
import "./styles/globals.css";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { flushEditors } from "./app/lib/editorFlush";
import { installGlobalErrorLogging, reactRootErrorOptions } from "./lib/errorLog";
import { initLaunchDir } from "./lib/launchDir";
import { USE_CUSTOM_WINDOW_CONTROLS } from "./lib/platform";
import { runStartupSync } from "./modules/agents/lib/startupSync";
import { loadPreferences, updateInstalledIntegrations } from "./modules/settings/store";
import { flushAgentTitles } from "./modules/workspaces/lib/agentTitleSync";
import { flushSidebarSnapshots } from "./modules/workspaces/lib/sidebarSnapshotSync";
import { flushTabUses } from "./modules/workspaces/lib/tabHistory";
import { claimClose, handleBeforeQuit, releaseClose, trackCloseFlush } from "./modules/workspaces/lib/closeClaim";
import { flushWorkspaceState, initWorkspaceState } from "./modules/workspaces/lib/workspaceState";
import { retryMissingWebgl } from "./modules/terminal/lib/rendererPool";

installGlobalErrorLogging();

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
// A failed load must not stop the window from showing.
const startupPrefs = await loadPreferences().catch((err) => {
  console.error("loadPreferences failed at startup:", err);
  return null;
});
// Load saved workspace layout for session restore.
await initWorkspaceState();

// Refreshes (or, with notifications off, removes) the agent integrations already present. Not
// awaited: a cold `claude --version` must never delay the first paint.
if (startupPrefs) {
  void (async () => {
    try {
      await runStartupSync(startupPrefs, updateInstalledIntegrations);
    } catch (err) {
      console.error("startup integration sync failed:", err);
    }
  })();
}

ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
  reactRootErrorOptions,
).render(
  <App />,
);

// Restore window geometry (position + size) before showing.
// Called here (on_window_ready equivalent) using physical pixels, matching
// tauri-plugin-window-state behaviour which proved correct on macOS.
await invoke("restore_window_geometry").catch(() => {});

// Window starts hidden (per tauri.conf.json) so users never see a transparent
// shadow-only frame before React paints. Use setTimeout - rAF is throttled
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

// Everything that must reach disk before a window closes or the app quits.
async function flushForClose(): Promise<void> {
  await flushAgentTitles();
  await flushSidebarSnapshots();
  await flushEditors();
  await flushTabUses();
  await flushWorkspaceState();
}

// Flush pending workspace state before the window closes so the 800ms debounce
// never loses changes. claimClose() is shared with the last-workspace-removed
// effect in useWorkspaces to prevent a double flush when both paths fire.
getCurrentWindow().onCloseRequested(async (event) => {
  if (!claimClose()) return;
  event.preventDefault();
  try {
    await trackCloseFlush(flushForClose());
    await getCurrentWindow().destroy();
  } catch {
    releaseClose();
  }
});

// Cmd+Q fires the custom Quit menu item in Rust (the predefined macOS quit can't
// be intercepted), which emits this so we can flush before confirming exit.
listen("kex:before-quit", () =>
  handleBeforeQuit(flushForClose, () => invoke<void>("confirm_quit").catch(() => {})),
);

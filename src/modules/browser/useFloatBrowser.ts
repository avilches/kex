import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect } from "react";
import type { Tab, Workspace } from "@/modules/workspaces/lib/types";
import { allPanes } from "@/modules/workspaces/lib/splitNode";

type DockEvent = { tabId: string; currentUrl: string };
type NavigatedEvent = { tabId: string; url: string };

type Deps = {
  updateTabData: (wsId: string, tabId: string, updater: (p: Tab) => Tab) => void;
  findTabGlobal: (tabId: string) => { workspace: { id: string }; tab: Tab } | null;
};

export function useFloatBrowser({
  updateTabData,
  findTabGlobal,
}: Deps) {
  const originWindowLabel = getCurrentWebviewWindow().label;

  // Listen for dock-back events from floating windows
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<DockEvent>("kex:float-dock", (e) => {
      const { tabId, currentUrl } = e.payload;
      const found = findTabGlobal(tabId);
      if (!found) return;
      updateTabData(found.workspace.id, tabId, (p) => ({
        ...p,
        floating: false,
        url: currentUrl || (p.kind === "browser" ? p.url : ""),
      }));
    })
      .then((u) => { unlisten = u; })
      .catch((err) => console.error("[float-browser] dock listen failed:", err));
    return () => { unlisten?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for URL navigation events from floating windows
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<NavigatedEvent>("kex:float-navigated", (e) => {
      const { tabId, url } = e.payload;
      const found = findTabGlobal(tabId);
      if (!found) return;
      updateTabData(found.workspace.id, tabId, (p) => ({
        ...p,
        url: url || (p.kind === "browser" ? p.url : ""),
      }));
    })
      .then((u) => { unlisten = u; })
      .catch((err) => console.error("[float-browser] navigated listen failed:", err));
    return () => { unlisten?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function floatTab(
    tab: Tab & { kind: "browser" },
    workspaceId: string,
  ): Promise<void> {
    if (!tab.url) return;
    // Mark as floating in state first so the placeholder renders immediately
    updateTabData(workspaceId, tab.id, (p) => ({ ...p, floating: true }));
    try {
      await invoke("float_browser_open", {
        tabId: tab.id,
        url: tab.url,
        originWindowLabel,
        workspaceId,
      });
    } catch (err) {
      // Rollback on failure
      updateTabData(workspaceId, tab.id, (p) => ({ ...p, floating: false }));
      console.error("[float-browser] open failed:", err);
    }
  }

  async function closeFloatWindow(tabId: string): Promise<void> {
    try {
      await invoke("float_browser_close", { tabId });
    } catch (err) {
      console.error("[float-browser] close failed:", err);
    }
  }

  async function focusFloatWindow(tabId: string): Promise<void> {
    try {
      await invoke("float_browser_focus", { tabId });
    } catch (err) {
      console.error("[float-browser] focus failed:", err);
    }
  }

  async function dockViaCommand(tabId: string): Promise<void> {
    try {
      await invoke("float_browser_dock", { tabId });
    } catch (err) {
      console.error("[float-browser] dock failed:", err);
    }
  }

  async function navigateFloatWindow(tabId: string, url: string): Promise<void> {
    if (!url) return;
    try {
      await invoke("float_browser_navigate", { tabId, url });
    } catch (err) {
      console.error("[float-browser] navigate failed:", err);
    }
  }

  // Called once on startup with the restored workspace list.
  // Re-opens floating windows for any tab with floating: true.
  async function restoreFloatingTabs(wss: Workspace[]): Promise<void> {
    for (const ws of wss) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const tab of pane.tabs) {
          if (tab.kind === "browser" && tab.floating && tab.url) {
            await invoke("float_browser_open", {
              tabId: tab.id,
              url: tab.url,
              originWindowLabel,
              workspaceId: ws.id,
            }).catch((err) =>
              console.error("[float-browser] restore failed:", err),
            );
          }
        }
      }
    }
  }

  // Destroys all floating windows belonging to a closing workspace (no dock).
  async function destroyWorkspaceFloats(
    closingWorkspaceId: string,
    wss: Workspace[],
  ): Promise<void> {
    const ws = wss.find((w) => w.id === closingWorkspaceId);
    if (!ws) return;
    for (const pane of allPanes(ws.paneTree)) {
      for (const tab of pane.tabs) {
        if (tab.kind === "browser" && tab.floating) {
          await invoke("float_browser_close", { tabId: tab.id }).catch(
            () => {},
          );
        }
      }
    }
  }

  return {
    floatTab,
    dockViaCommand,
    closeFloatWindow,
    focusFloatWindow,
    navigateFloatWindow,
    restoreFloatingTabs,
    destroyWorkspaceFloats,
  };
}

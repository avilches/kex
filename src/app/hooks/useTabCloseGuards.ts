import { useCallback, useRef, useState } from "react";
import { leafHasForegroundProcess } from "@/modules/terminal";
import type { Workspace } from "@/modules/workspaces";
import { allPanes } from "@/modules/workspaces";
import { getRunningCommandsSnapshot } from "@/modules/workspaces/lib/terminalEphemeralStore";
import {
  runCloseQueue,
  type EditorCloseDecision,
  type TerminalCloseDecision,
} from "./closeQueue";

type TabInfo = { id: string; title: string; kind: string; path?: string; processName?: string; command?: string };

type FoundTab = {
  workspace: { id: string };
  tab: { kind: string; dirty?: boolean; locked?: boolean; path?: string; title?: string };
};

type Params = {
  workspaces: Workspace[];
  disposeTab: (workspaceId: string, tabId: string) => void;
  findTab: (tabId: string) => FoundTab | null;
  saveTab: (tabId: string) => Promise<void>;
  focusActiveTab: () => void;
  isWarnEnabled: () => boolean;
  setWarnEnabled: (value: boolean) => Promise<void>;
  isAutoSaveEnabled: () => boolean;
};

/**
 * Guards tab closing: dirty editors and terminals with a live foreground
 * process route through a confirmation dialog. Closes run through one
 * sequential queue so bulk closes pause on each guard and a cancel stops the
 * whole run.
 */
export function useTabCloseGuards({
  workspaces,
  disposeTab,
  findTab,
  saveTab,
  focusActiveTab,
  isWarnEnabled,
  setWarnEnabled,
  isAutoSaveEnabled,
}: Params) {
  const [pendingCloseTab, setPendingCloseTab] = useState<TabInfo | null>(null);
  const [pendingTerminalCloseTab, setPendingTerminalCloseTab] = useState<TabInfo | null>(null);
  const [pendingDeleteTabs, setPendingDeleteTabs] = useState<TabInfo[] | null>(null);

  const editorResolverRef = useRef<((d: EditorCloseDecision) => void) | null>(null);
  const terminalResolverRef = useRef<((d: TerminalCloseDecision) => void) | null>(null);

  const askEditorClose = useCallback(
    (tabId: string) =>
      new Promise<EditorCloseDecision>((resolve) => {
        const found = findTab(tabId);
        const tab = found?.tab;
        setPendingCloseTab({
          id: tabId,
          title: tab?.title ?? tab?.path ?? "file",
          kind: "editor",
          path: tab?.path,
        });
        editorResolverRef.current = resolve;
      }),
    [findTab],
  );

  const askTerminalClose = useCallback(
    (tabId: string, processName: string) =>
      new Promise<TerminalCloseDecision>((resolve) => {
        const found = findTab(tabId);
        setPendingTerminalCloseTab({
          id: tabId,
          title: found?.tab.title ?? "terminal",
          kind: "terminal",
          processName,
          command: getRunningCommandsSnapshot().get(tabId),
        });
        terminalResolverRef.current = resolve;
      }),
    [findTab],
  );

  const resolveEditor = useCallback((decision: EditorCloseDecision) => {
    setPendingCloseTab(null);
    const resolve = editorResolverRef.current;
    editorResolverRef.current = null;
    resolve?.(decision);
  }, []);

  const resolveTerminal = useCallback((decision: TerminalCloseDecision) => {
    setPendingTerminalCloseTab(null);
    const resolve = terminalResolverRef.current;
    terminalResolverRef.current = null;
    resolve?.(decision);
  }, []);

  const closeTabs = useCallback(
    async (tabIds: string[]) => {
      try {
        await runCloseQueue(tabIds, {
          getTab: (id) => {
            const found = findTab(id);
            if (!found) return null;
            return {
              kind: found.tab.kind,
              locked: found.tab.locked,
              dirty: found.tab.dirty,
            };
          },
          hasForegroundProcess: (id) => leafHasForegroundProcess(id),
          isWarnEnabled,
          setWarnEnabled,
          isAutoSaveEnabled,
          askTerminalClose,
          askEditorClose,
          saveTab,
          closeTab: (id) => {
            const found = findTab(id);
            if (found) disposeTab(found.workspace.id, id);
          },
        });
      } catch (e) {
        console.error("[kex] close queue failed", e);
      } finally {
        focusActiveTab();
      }
    },
    [
      findTab,
      disposeTab,
      saveTab,
      focusActiveTab,
      isWarnEnabled,
      setWarnEnabled,
      isAutoSaveEnabled,
      askTerminalClose,
      askEditorClose,
    ],
  );

  const confirmDeleteClose = useCallback(() => {
    if (pendingDeleteTabs !== null) {
      for (const p of pendingDeleteTabs) {
        const found = findTab(p.id);
        if (found) disposeTab(found.workspace.id, p.id);
      }
      setPendingDeleteTabs(null);
    }
  }, [pendingDeleteTabs, findTab, disposeTab]);

  const cancelDeleteClose = useCallback(() => setPendingDeleteTabs(null), []);

  const handlePathDeleted = useCallback(
    (path: string) => {
      const dirty: TabInfo[] = [];
      for (const ws of workspaces) {
        for (const pane of allPanes(ws.paneTree)) {
          for (const tab of pane.tabs) {
            if (tab.kind !== "editor") continue;
            const p = (tab as { path?: string }).path ?? "";
            if (p !== path && !p.startsWith(`${path}/`)) continue;
            if ((tab as { dirty?: boolean }).dirty) {
              dirty.push({ id: tab.id, title: tab.title ?? p, kind: tab.kind, path: p });
            } else {
              disposeTab(ws.id, tab.id);
            }
          }
        }
      }
      if (dirty.length > 0) setPendingDeleteTabs(dirty);
    },
    [workspaces, disposeTab],
  );

  return {
    pendingCloseTab,
    pendingTerminalCloseTab,
    pendingDeleteTabs,
    closeTabs,
    resolveEditor,
    resolveTerminal,
    confirmDeleteClose,
    cancelDeleteClose,
    handlePathDeleted,
  };
}

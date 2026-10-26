import { useCallback, useRef, useState } from "react";
import { leafHasForegroundProcess } from "@/modules/terminal";
import { getRunningCommandsSnapshot } from "@/modules/workspaces/lib/terminalEphemeralStore";
import { isHibernatedTab } from "@/modules/workspaces/lib/hibernate";
import type { Tab } from "@/modules/workspaces/lib/types";
import {
  runCloseQueue,
  type EditorCloseDecision,
  type TerminalCloseDecision,
} from "./closeQueue";

type TabInfo = { id: string; title: string; kind: string; path?: string; processName?: string; command?: string; tab?: Tab };

type FoundTab = {
  workspace: { id: string };
  tab: { kind: string; dirty?: boolean; locked?: boolean; path?: string; title?: string } & Tab;
};

type Params = {
  disposeTab: (workspaceId: string, tabId: string) => void;
  findTab: (tabId: string) => FoundTab | null;
  saveTab: (tabId: string) => Promise<void>;
  reportSaveError: (tabId: string, error: unknown) => void;
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
  disposeTab,
  findTab,
  saveTab,
  reportSaveError,
  focusActiveTab,
  isWarnEnabled,
  setWarnEnabled,
  isAutoSaveEnabled,
}: Params) {
  const [pendingCloseTab, setPendingCloseTab] = useState<TabInfo | null>(null);
  const [pendingTerminalCloseTab, setPendingTerminalCloseTab] = useState<TabInfo | null>(null);

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
          tab: found?.tab,
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
    async (tabIds: string[]): Promise<boolean> => {
      try {
        return await runCloseQueue(tabIds, {
          getTab: (id) => {
            const found = findTab(id);
            if (!found) return null;
            return {
              kind: found.tab.kind,
              locked: found.tab.locked,
              dirty: found.tab.dirty,
            };
          },
          // A sleeping tab has no process to warn about.
          hasForegroundProcess: async (id) => (isHibernatedTab(findTab(id)?.tab) ? null : leafHasForegroundProcess(id)),
          isWarnEnabled,
          setWarnEnabled,
          isAutoSaveEnabled,
          askTerminalClose,
          askEditorClose,
          saveTab,
          reportSaveError,
          closeTab: (id) => {
            const found = findTab(id);
            if (found) disposeTab(found.workspace.id, id);
          },
        });
      } catch (e) {
        console.error("[kex] close queue failed", e);
        return false;
      } finally {
        focusActiveTab();
      }
    },
    [
      findTab,
      disposeTab,
      saveTab,
      reportSaveError,
      focusActiveTab,
      isWarnEnabled,
      setWarnEnabled,
      isAutoSaveEnabled,
      askTerminalClose,
      askEditorClose,
    ],
  );

  return {
    pendingCloseTab,
    pendingTerminalCloseTab,
    closeTabs,
    resolveEditor,
    resolveTerminal,
  };
}

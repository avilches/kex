import { useCallback, useRef, useState } from "react";
import { newCloseBatchId } from "@/lib/ids";
import { leafHasForegroundProcess } from "@/modules/terminal";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { getRunningCommandsSnapshot } from "@/modules/workspaces/lib/terminalEphemeralStore";
import { isHibernatedTab } from "@/modules/workspaces/lib/hibernate";
import { liveAgent } from "@/modules/workspaces/lib/hibernateReview";
import type { Tab } from "@/modules/workspaces/lib/types";
import {
  runCloseQueue,
  type EditorCloseDecision,
  type TerminalCloseDecision,
  type TerminalCloseWarning,
} from "./closeQueue";

export type TabInfo = { id: string; title: string; kind: string; path?: string; workspaceId?: string; warning?: TerminalCloseWarning; command?: string; tab?: Tab };

type FoundTab = {
  workspace: { id: string };
  tab: { kind: string; dirty?: boolean; locked?: boolean; path?: string; title?: string } & Tab;
};

type Params = {
  disposeTab: (workspaceId: string, tabId: string, batchId?: string) => void;
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
    (tabId: string, warning: TerminalCloseWarning) =>
      new Promise<TerminalCloseDecision>((resolve) => {
        const found = findTab(tabId);
        setPendingTerminalCloseTab({
          id: tabId,
          title: found?.tab.title ?? "terminal",
          kind: "terminal",
          workspaceId: found?.workspace.id,
          warning,
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
      const batchId = tabIds.length > 1 ? newCloseBatchId() : undefined;
      try {
        return await runCloseQueue(tabIds, {
          getTab: (id) => {
            const found = findTab(id);
            if (!found) return null;
            return {
              kind: found.tab.kind,
              locked: found.tab.locked,
              dirty: found.tab.dirty,
              hibernated: isHibernatedTab(found.tab),
            };
          },
          hasForegroundProcess: (id) => leafHasForegroundProcess(id),
          hasBusyAgent: (id) => liveAgent(useAgentStore.getState().sessions[id])?.status === "working",
          hasAgent: (id) => liveAgent(useAgentStore.getState().sessions[id]) !== undefined,
          isWarnEnabled,
          setWarnEnabled,
          isAutoSaveEnabled,
          askTerminalClose,
          askEditorClose,
          saveTab,
          reportSaveError,
          closeTab: (id) => {
            const found = findTab(id);
            if (found) disposeTab(found.workspace.id, id, batchId);
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

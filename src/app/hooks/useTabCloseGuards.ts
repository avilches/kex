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

type PanelInfo = { id: string; title: string; kind: string; path?: string; processName?: string; command?: string };

type FoundPanel = {
  workspace: { id: string };
  tab: { kind: string; dirty?: boolean; locked?: boolean; path?: string; title?: string };
};

type Params = {
  workspaces: Workspace[];
  disposePanel: (workspaceId: string, panelId: string) => void;
  findPanel: (panelId: string) => FoundPanel | null;
  savePanel: (panelId: string) => Promise<void>;
  focusActivePanel: () => void;
  isWarnEnabled: () => boolean;
  setWarnEnabled: (value: boolean) => Promise<void>;
  isAutoSaveEnabled: () => boolean;
};

/**
 * Guards panel closing: dirty editors and terminals with a live foreground
 * process route through a confirmation dialog. Closes run through one
 * sequential queue so bulk closes pause on each guard and a cancel stops the
 * whole run.
 */
export function useTabCloseGuards({
  workspaces,
  disposePanel,
  findPanel,
  savePanel,
  focusActivePanel,
  isWarnEnabled,
  setWarnEnabled,
  isAutoSaveEnabled,
}: Params) {
  const [pendingClosePanel, setPendingClosePanel] = useState<PanelInfo | null>(null);
  const [pendingTerminalClosePanel, setPendingTerminalClosePanel] = useState<PanelInfo | null>(null);
  const [pendingDeletePanels, setPendingDeletePanels] = useState<PanelInfo[] | null>(null);

  const editorResolverRef = useRef<((d: EditorCloseDecision) => void) | null>(null);
  const terminalResolverRef = useRef<((d: TerminalCloseDecision) => void) | null>(null);

  const askEditorClose = useCallback(
    (panelId: string) =>
      new Promise<EditorCloseDecision>((resolve) => {
        const found = findPanel(panelId);
        const panel = found?.tab;
        setPendingClosePanel({
          id: panelId,
          title: panel?.title ?? panel?.path ?? "file",
          kind: "editor",
          path: panel?.path,
        });
        editorResolverRef.current = resolve;
      }),
    [findPanel],
  );

  const askTerminalClose = useCallback(
    (panelId: string, processName: string) =>
      new Promise<TerminalCloseDecision>((resolve) => {
        const found = findPanel(panelId);
        setPendingTerminalClosePanel({
          id: panelId,
          title: found?.tab.title ?? "terminal",
          kind: "terminal",
          processName,
          command: getRunningCommandsSnapshot().get(panelId),
        });
        terminalResolverRef.current = resolve;
      }),
    [findPanel],
  );

  const resolveEditor = useCallback((decision: EditorCloseDecision) => {
    setPendingClosePanel(null);
    const resolve = editorResolverRef.current;
    editorResolverRef.current = null;
    resolve?.(decision);
  }, []);

  const resolveTerminal = useCallback((decision: TerminalCloseDecision) => {
    setPendingTerminalClosePanel(null);
    const resolve = terminalResolverRef.current;
    terminalResolverRef.current = null;
    resolve?.(decision);
  }, []);

  const closePanels = useCallback(
    async (panelIds: string[]) => {
      try {
        await runCloseQueue(panelIds, {
          getPanel: (id) => {
            const found = findPanel(id);
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
          savePanel,
          closeTab: (id) => {
            const found = findPanel(id);
            if (found) disposePanel(found.workspace.id, id);
          },
        });
      } catch (e) {
        console.error("[kex] close queue failed", e);
      } finally {
        focusActivePanel();
      }
    },
    [
      findPanel,
      disposePanel,
      savePanel,
      focusActivePanel,
      isWarnEnabled,
      setWarnEnabled,
      isAutoSaveEnabled,
      askTerminalClose,
      askEditorClose,
    ],
  );

  const confirmDeleteClose = useCallback(() => {
    if (pendingDeletePanels !== null) {
      for (const p of pendingDeletePanels) {
        const found = findPanel(p.id);
        if (found) disposePanel(found.workspace.id, p.id);
      }
      setPendingDeletePanels(null);
    }
  }, [pendingDeletePanels, findPanel, disposePanel]);

  const cancelDeleteClose = useCallback(() => setPendingDeletePanels(null), []);

  const handlePathDeleted = useCallback(
    (path: string) => {
      const dirty: PanelInfo[] = [];
      for (const ws of workspaces) {
        for (const pane of allPanes(ws.paneTree)) {
          for (const tab of pane.tabs) {
            if (tab.kind !== "editor") continue;
            const p = (tab as { path?: string }).path ?? "";
            if (p !== path && !p.startsWith(`${path}/`)) continue;
            if ((tab as { dirty?: boolean }).dirty) {
              dirty.push({ id: tab.id, title: tab.title ?? p, kind: tab.kind, path: p });
            } else {
              disposePanel(ws.id, tab.id);
            }
          }
        }
      }
      if (dirty.length > 0) setPendingDeletePanels(dirty);
    },
    [workspaces, disposePanel],
  );

  return {
    pendingClosePanel,
    pendingTerminalClosePanel,
    pendingDeletePanels,
    closePanels,
    resolveEditor,
    resolveTerminal,
    confirmDeleteClose,
    cancelDeleteClose,
    handlePathDeleted,
  };
}

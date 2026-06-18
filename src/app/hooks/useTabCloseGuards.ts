import { useCallback, useState } from "react";
import { leafHasForegroundProcess } from "@/modules/terminal";
import type { Workspace } from "@/modules/workspaces";
import { allPanes } from "@/modules/workspaces";

type PanelInfo = { id: string; title: string; kind: string; path?: string; processName?: string };

type Params = {
  workspaces: Workspace[];
  disposePanel: (workspaceId: string, panelId: string) => void;
  findPanel: (panelId: string) => { workspace: { id: string }; panel: { kind: string; dirty?: boolean; path?: string; title?: string } } | null;
};

/**
 * Guards panel closing: dirty editors and terminals with a live foreground
 * process route through a confirmation dialog instead of closing immediately.
 */
export function useTabCloseGuards({ workspaces, disposePanel, findPanel }: Params) {
  const [pendingClosePanel, setPendingClosePanel] = useState<PanelInfo | null>(null);
  const [pendingTerminalClosePanel, setPendingTerminalClosePanel] = useState<PanelInfo | null>(null);
  const [pendingDeletePanels, setPendingDeletePanels] = useState<PanelInfo[] | null>(null);

  const handleClose = useCallback(
    async (workspaceId: string, panelId: string) => {
      const found = findPanel(panelId);
      if (!found) return;
      const { panel } = found;

      if (panel.kind === "editor" && (panel as { dirty?: boolean }).dirty) {
        setPendingClosePanel({ id: panelId, title: panel.title ?? panel.path ?? "file", kind: panel.kind, path: (panel as { path?: string }).path });
        return;
      }
      if (panel.kind === "terminal") {
        const processName = await leafHasForegroundProcess(panelId).catch(() => null);
        if (processName !== null) {
          setPendingTerminalClosePanel({ id: panelId, title: panel.title ?? "terminal", kind: panel.kind, processName });
          return;
        }
      }
      disposePanel(workspaceId, panelId);
    },
    [findPanel, disposePanel],
  );

  const confirmClose = useCallback(() => {
    if (pendingClosePanel !== null) {
      const found = findPanel(pendingClosePanel.id);
      if (found) disposePanel(found.workspace.id, pendingClosePanel.id);
      setPendingClosePanel(null);
    }
  }, [pendingClosePanel, findPanel, disposePanel]);

  const cancelClose = useCallback(() => setPendingClosePanel(null), []);

  const confirmTerminalClose = useCallback(() => {
    if (pendingTerminalClosePanel !== null) {
      const found = findPanel(pendingTerminalClosePanel.id);
      if (found) disposePanel(found.workspace.id, pendingTerminalClosePanel.id);
      setPendingTerminalClosePanel(null);
    }
  }, [pendingTerminalClosePanel, findPanel, disposePanel]);

  const cancelTerminalClose = useCallback(() => setPendingTerminalClosePanel(null), []);

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
          for (const panel of pane.panels) {
            if (panel.kind !== "editor") continue;
            const p = (panel as { path?: string }).path ?? "";
            if (p !== path && !p.startsWith(`${path}/`)) continue;
            if ((panel as { dirty?: boolean }).dirty) {
              dirty.push({ id: panel.id, title: panel.title ?? p, kind: panel.kind, path: p });
            } else {
              disposePanel(ws.id, panel.id);
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
    handleClose,
    confirmClose,
    cancelClose,
    confirmTerminalClose,
    cancelTerminalClose,
    confirmDeleteClose,
    cancelDeleteClose,
    handlePathDeleted,
  };
}

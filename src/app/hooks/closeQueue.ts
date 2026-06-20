export type TerminalCloseDecision =
  | { type: "cancel" }
  | { type: "close"; dontAskAgain: boolean };

export type EditorCloseDecision =
  | { type: "cancel" }
  | { type: "save" }
  | { type: "dont-save" };

export type CloseQueuePanel = {
  kind: string;
  locked?: boolean;
  dirty?: boolean;
};

export type CloseQueueDeps = {
  getPanel: (panelId: string) => CloseQueuePanel | null;
  hasForegroundProcess: (panelId: string) => Promise<string | null>;
  isWarnEnabled: () => boolean;
  setWarnEnabled: (value: boolean) => Promise<void>;
  askTerminalClose: (
    panelId: string,
    processName: string,
  ) => Promise<TerminalCloseDecision>;
  askEditorClose: (panelId: string) => Promise<EditorCloseDecision>;
  savePanel: (panelId: string) => Promise<void>;
  closePanel: (panelId: string) => void;
};

/**
 * Closes panels one at a time. A panel that needs confirmation pauses the
 * queue until the user answers; a cancel stops the entire run before closing
 * the current panel. Once the user opts out of the running-process warning,
 * the rest of the run closes without re-asking.
 */
export async function runCloseQueue(
  panelIds: string[],
  deps: CloseQueueDeps,
): Promise<void> {
  let suppressTerminalWarn = false;
  for (const panelId of panelIds) {
    const panel = deps.getPanel(panelId);
    if (!panel) continue;

    if (panel.kind === "terminal") {
      if (panel.locked) continue;
      if (deps.isWarnEnabled() && !suppressTerminalWarn) {
        const processName = await deps
          .hasForegroundProcess(panelId)
          .catch(() => null);
        if (processName !== null) {
          const decision = await deps.askTerminalClose(panelId, processName);
          if (decision.type === "cancel") return;
          if (decision.dontAskAgain) {
            await deps.setWarnEnabled(false);
            suppressTerminalWarn = true;
          }
        }
      }
    } else if (panel.kind === "editor") {
      if (panel.locked) continue;
      if (panel.dirty) {
        const decision = await deps.askEditorClose(panelId);
        if (decision.type === "cancel") return;
        if (decision.type === "save") await deps.savePanel(panelId);
      }
    }

    deps.closePanel(panelId);
  }
}

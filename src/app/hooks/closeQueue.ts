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
  getPanel: (tabId: string) => CloseQueuePanel | null;
  hasForegroundProcess: (tabId: string) => Promise<string | null>;
  isWarnEnabled: () => boolean;
  setWarnEnabled: (value: boolean) => Promise<void>;
  isAutoSaveEnabled: () => boolean;
  askTerminalClose: (
    tabId: string,
    processName: string,
  ) => Promise<TerminalCloseDecision>;
  askEditorClose: (tabId: string) => Promise<EditorCloseDecision>;
  saveTab: (tabId: string) => Promise<void>;
  closeTab: (tabId: string) => void;
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
  for (const tabId of panelIds) {
    const panel = deps.getPanel(tabId);
    if (!panel) continue;

    if (panel.kind === "terminal") {
      if (panel.locked) continue;
      if (deps.isWarnEnabled() && !suppressTerminalWarn) {
        const processName = await deps
          .hasForegroundProcess(tabId)
          .catch(() => null);
        if (processName !== null) {
          const decision = await deps.askTerminalClose(tabId, processName);
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
        if (deps.isAutoSaveEnabled()) {
          await deps.saveTab(tabId);
        } else {
          const decision = await deps.askEditorClose(tabId);
          if (decision.type === "cancel") return;
          if (decision.type === "save") await deps.saveTab(tabId);
        }
      }
    }

    deps.closeTab(tabId);
  }
}

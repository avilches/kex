export type TerminalCloseDecision =
  | { type: "cancel" }
  | { type: "close"; dontAskAgain: boolean };

export type EditorCloseDecision =
  | { type: "cancel" }
  | { type: "save" }
  | { type: "dont-save" };

export type CloseQueueTab = {
  kind: string;
  locked?: boolean;
  dirty?: boolean;
};

export type CloseQueueDeps = {
  getTab: (tabId: string) => CloseQueueTab | null;
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
 * Closes tabs one at a time. A tab that needs confirmation pauses the
 * queue until the user answers; a cancel stops the entire run before closing
 * the current tab. Once the user opts out of the running-process warning,
 * the rest of the run closes without re-asking.
 */
export async function runCloseQueue(
  tabIds: string[],
  deps: CloseQueueDeps,
): Promise<void> {
  let suppressTerminalWarn = false;
  for (const tabId of tabIds) {
    const tab = deps.getTab(tabId);
    if (!tab) continue;

    if (tab.kind === "terminal") {
      if (tab.locked) continue;
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
    } else if (tab.kind === "editor") {
      if (tab.locked) continue;
      if (tab.dirty) {
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

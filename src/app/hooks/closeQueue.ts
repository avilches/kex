export type TerminalCloseDecision = { type: "cancel" } | { type: "close" };

export type EditorCloseDecision =
  | { type: "cancel" }
  | { type: "save" }
  | { type: "dont-save" };

export type CloseQueueTab = {
  kind: string;
  locked?: boolean;
  dirty?: boolean;
  // Asleep: nothing is running, so closing it is never worth a question.
  hibernated?: boolean;
};

export type CloseQueueDeps = {
  getTab: (tabId: string) => CloseQueueTab | null;
  // A working agent is the only thing about a terminal worth a question: a process or a script
  // is stopped without asking, since the Restore Command brings it back.
  hasBusyAgent: (tabId: string) => boolean;
  isAutoSaveEnabled: () => boolean;
  askTerminalClose: (tabId: string) => Promise<TerminalCloseDecision>;
  askEditorClose: (tabId: string) => Promise<EditorCloseDecision>;
  saveTab: (tabId: string) => Promise<void>;
  reportSaveError: (tabId: string, error: unknown) => void;
  closeTab: (tabId: string) => void;
};

/**
 * Closes tabs one at a time. A tab that needs confirmation pauses the queue until the user
 * answers; a cancel stops the entire run before closing the current tab. Returns whether every
 * tab in the list was actually closed (false if a cancel or a failed save, such as an unresolved
 * disk conflict, stopped the run early), so a caller that closes a whole workspace afterward
 * doesn't have to infer it from workspace state that may not have re-rendered yet.
 */
export async function runCloseQueue(
  tabIds: string[],
  deps: CloseQueueDeps,
): Promise<boolean> {
  for (const tabId of tabIds) {
    const tab = deps.getTab(tabId);
    if (!tab) continue;

    if (tab.kind === "terminal") {
      if (tab.locked) continue;
      if (!tab.hibernated && deps.hasBusyAgent(tabId)) {
        const decision = await deps.askTerminalClose(tabId);
        if (decision.type === "cancel") return false;
      }
    } else if (tab.kind === "editor" || tab.kind === "markdown") {
      if (tab.locked) continue;
      if (tab.dirty) {
        let shouldSave = deps.isAutoSaveEnabled();
        if (!shouldSave) {
          const decision = await deps.askEditorClose(tabId);
          if (decision.type === "cancel") return false;
          shouldSave = decision.type === "save";
        }
        if (shouldSave) {
          try {
            await deps.saveTab(tabId);
          } catch (e) {
            deps.reportSaveError(tabId, e);
            return false;
          }
        }
      }
    }

    deps.closeTab(tabId);
  }
  return true;
}

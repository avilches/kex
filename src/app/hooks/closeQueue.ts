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
  // Asleep: no process to lose, so closing it is never worth a question.
  hibernated?: boolean;
};

// What closing a terminal interrupts. A busy agent is always asked about; a foreground process
// only while the user keeps that warning on.
export type TerminalCloseWarning =
  | { reason: "agent" }
  | { reason: "process"; processName: string };

export function terminalCloseWarning(input: {
  busyAgent: boolean;
  processName: string | null;
  warnProcesses: boolean;
}): TerminalCloseWarning | null {
  if (input.busyAgent) return { reason: "agent" };
  if (input.processName !== null && input.warnProcesses) return { reason: "process", processName: input.processName };
  return null;
}

export type CloseQueueDeps = {
  getTab: (tabId: string) => CloseQueueTab | null;
  hasForegroundProcess: (tabId: string) => Promise<string | null>;
  hasBusyAgent: (tabId: string) => boolean;
  // A live agent session, working or not: an idle one keeps its process in the foreground but has
  // nothing to lose, so it is never asked about as a process.
  hasAgent: (tabId: string) => boolean;
  isWarnEnabled: () => boolean;
  setWarnEnabled: (value: boolean) => Promise<void>;
  isAutoSaveEnabled: () => boolean;
  askTerminalClose: (
    tabId: string,
    warning: TerminalCloseWarning,
  ) => Promise<TerminalCloseDecision>;
  askEditorClose: (tabId: string) => Promise<EditorCloseDecision>;
  saveTab: (tabId: string) => Promise<void>;
  reportSaveError: (tabId: string, error: unknown) => void;
  closeTab: (tabId: string) => void;
};

/**
 * Closes tabs one at a time. A tab that needs confirmation pauses the
 * queue until the user answers; a cancel stops the entire run before closing
 * the current tab. Once the user opts out of the running-process warning,
 * the rest of the run closes without re-asking (a busy agent is still asked
 * about). Returns whether every tab in the list was actually closed (false
 * if a cancel or a failed save, such as an unresolved disk conflict, stopped
 * the run early), so a caller that closes a whole workspace afterward doesn't
 * have to infer it from workspace state that may not have re-rendered yet.
 */
export async function runCloseQueue(
  tabIds: string[],
  deps: CloseQueueDeps,
): Promise<boolean> {
  let suppressTerminalWarn = false;
  for (const tabId of tabIds) {
    const tab = deps.getTab(tabId);
    if (!tab) continue;

    if (tab.kind === "terminal") {
      if (tab.locked) continue;
      if (!tab.hibernated) {
        const busyAgent = deps.hasBusyAgent(tabId);
        const warnProcesses = deps.isWarnEnabled() && !suppressTerminalWarn;
        const probe = !busyAgent && warnProcesses && !deps.hasAgent(tabId);
        const processName = probe ? await deps.hasForegroundProcess(tabId).catch(() => null) : null;
        const warning = terminalCloseWarning({ busyAgent, processName, warnProcesses });
        if (warning) {
          const decision = await deps.askTerminalClose(tabId, warning);
          if (decision.type === "cancel") return false;
          if (decision.dontAskAgain) {
            await deps.setWarnEnabled(false);
            suppressTerminalWarn = true;
          }
        }
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

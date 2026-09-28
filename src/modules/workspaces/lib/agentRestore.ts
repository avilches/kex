import type { Tab } from "./types";

export function agentRestoreDisabled(tab: Tab): boolean {
  return tab.kind === "terminal" && tab.restoreOnRestart === false;
}

import { useSyncExternalStore } from "react";
import {
  getCommandFailed,
  getRunningCommand,
  subscribeToRunningCommands,
} from "./terminalEphemeralStore";

export type CommandMark = "working" | "error" | null;

const SIGINT_EXIT = 130;

// Ctrl-C is the user stopping the command, not a failure of it.
export function isFailedExit(code: number): boolean {
  return code !== 0 && code !== SIGINT_EXIT;
}

// A running command wins over the failure of the previous one.
export function commandMark(running: boolean, failed: boolean): CommandMark {
  return running ? "working" : failed ? "error" : null;
}

export function useCommandMark(tabId: string, isTerminal: boolean): CommandMark {
  const running = useSyncExternalStore(subscribeToRunningCommands, () =>
    isTerminal ? getRunningCommand(tabId) !== null : false,
  );
  const failed = useSyncExternalStore(subscribeToRunningCommands, () =>
    isTerminal ? getCommandFailed(tabId) : false,
  );
  return commandMark(running, failed);
}

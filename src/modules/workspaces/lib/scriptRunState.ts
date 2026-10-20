import type { ScriptState } from "./terminalEphemeralStore";

export const SCRIPT_WRITE_MAX_ATTEMPTS = 20;

export type DelayedWriteStep = "write" | "retry" | "abandon";

/**
 * What the delayed write of a script command should do now. "abandon" means
 * the caller must clear the running mark: a Stop that landed before the write
 * turned it into "waiting", and no command will ever run to clear it.
 */
export function planDelayedWrite(
  mark: ScriptState | undefined,
  hasHandle: boolean,
  attempts: number,
): DelayedWriteStep {
  if (mark !== "running") return "abandon";
  if (hasHandle) return "write";
  return attempts < SCRIPT_WRITE_MAX_ATTEMPTS ? "retry" : "abandon";
}

/**
 * Mark to set when Stop is pressed. Without a seen command nothing will emit
 * the end-of-command event that clears "waiting", so the mark goes away now.
 */
export function planScriptStop(commandSeen: boolean): ScriptState | false {
  return commandSeen ? "waiting" : false;
}

/**
 * Reacts to a shell command boundary in a tab. A command counts as started
 * when its text is known or the shell said it started without text (bash
 * emits OSC 133;C bare); the mark is cleared at the first boundary after it.
 */
export function planCommandEvent(
  event: { cmd: string | null; started?: boolean },
  seen: boolean,
  marked: boolean,
): { seen: boolean; clearMark: boolean } {
  if (event.cmd !== null || event.started) return { seen: true, clearMark: false };
  if (seen && marked) return { seen: false, clearMark: true };
  return { seen, clearMark: false };
}

/**
 * The command a tab reports as running. A script is typed as its expanded command,
 * so the shell reports that wrapper; the tab should show the user's command.
 */
export function displayedRunningCommand(
  cmd: string | null,
  scriptCommand: string | null,
): string | null {
  return cmd !== null && scriptCommand ? scriptCommand : cmd;
}

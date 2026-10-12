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

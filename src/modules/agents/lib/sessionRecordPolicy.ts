import type { AgentSignal } from "./types";

// The stored session record mirrors what is running in the terminal, so only the
// end of the agent process drops it. StopFailure (a failed turn) and SessionEnd
// (also emitted by /clear and /resume, which keep the process alive) must not:
// Claude Code only emits SessionStart on launch, resume and /clear, so nothing
// would ever record the session again.
export function dropsStoredSession(kind: AgentSignal["kind"]): boolean {
  return kind === "exited";
}

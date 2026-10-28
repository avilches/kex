import { useEffect, useState, useSyncExternalStore } from "react";
import { previewResumeCmd } from "@/modules/agents/lib/agentSessionRestore";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { commandOnUndoClose, followableCommand } from "@/modules/terminal/lib/restoreCommand";
import { withLiveRestoreCommand } from "@/modules/workspaces/lib/restoreCommandSave";
import {
  getRunningCommandsSnapshot,
  getRunningScriptCommand,
  subscribeToRunningCommands,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import type { Tab } from "@/modules/workspaces/lib/types";

/**
 * The command the tab runs when it comes back (undo of a close, or waking from hibernation), as
 * it will be stored: the Restore Command is always saved, so this is what the shell reports now, or the
 * agent's resume command. Null when there is nothing to run.
 */
export function useRestoreCommand(tab: Tab | undefined): string | null {
  const id = tab?.id;
  const isTerminal = tab?.kind === "terminal";
  const agentSession = useAgentStore((s) => (id ? (s.sessions[id] ?? null) : null));
  const reported = useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot);
  const isAgent = agentSession !== null;

  const [resumeCmd, setResumeCmd] = useState<string | null>(null);
  useEffect(() => {
    setResumeCmd(null);
    if (!id || !isTerminal || !isAgent) return;
    let cancelled = false;
    void previewResumeCmd(id).then((plan) => {
      if (!cancelled) setResumeCmd(plan?.resumeCmd ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [id, isTerminal, isAgent]);

  if (tab?.kind !== "terminal" || tab.hibernation) return null;
  const saved = withLiveRestoreCommand(tab);
  if (saved.kind !== "terminal") return null;
  const running = followableCommand(reported.get(tab.id) ?? null, getRunningScriptCommand(tab.id));
  return commandOnUndoClose(saved, running, resumeCmd, isAgent);
}

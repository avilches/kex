import { newActionId } from "@/lib/ids";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { agentSuggestionsFromDetected, hasCommandOf } from "./appSuggestions";
import type { Action } from "./types";

type Args = {
  seeded: boolean;
  agents: readonly DetectedEditor[];
  existing: readonly Action[];
};

/** The Actions to add the first time agents are detected: one starting in the current
 * directory per enabled agent, skipping any the list already has. */
export function planAgentSeed({ seeded, agents, existing }: Args): Action[] {
  if (seeded) return [];
  return agentSuggestionsFromDetected(agents)
    .filter((s) => s.cwdMode === "context")
    .filter((s) => !hasCommandOf(existing, s.defaultCommand, s.kind, s.cwdMode))
    .map((s) => ({
      id: newActionId(),
      name: s.name,
      kind: s.kind,
      command: s.defaultCommand,
      appId: s.appId,
      iconId: s.iconId ?? undefined,
      cwdMode: "context",
      ownButton: true,
    }));
}

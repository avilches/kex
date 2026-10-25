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
 * directory per enabled agent, skipping any the list already has. Null means there is nothing
 * to seed yet (already seeded, or no enabled agent), so the seeded flag must stay as it is; an
 * empty list means every one is already there. */
export function planAgentSeed({ seeded, agents, existing }: Args): Action[] | null {
  if (seeded) return null;
  const presets = agentSuggestionsFromDetected(agents).filter((s) => s.cwdMode === "context");
  if (presets.length === 0) return null;
  return presets
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

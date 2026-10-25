import { newActionId } from "@/lib/ids";
import type { DetectedEditor } from "@/modules/external-editors/types";
import {
  actionFromSuggestion,
  agentSuggestionsFromDetected,
  hasCommandOf,
  suggestionsFromDetected,
} from "./appSuggestions";
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

type AppArgs = {
  seeded: boolean;
  editors: readonly DetectedEditor[];
  existing: readonly Action[];
};

/** The Actions to add the first time apps are detected: the current-directory preset of each
 * enabled app, inside the combo, skipping any command the list already has. Null and empty mean
 * the same as in `planAgentSeed`. */
export function planAppSeed({ seeded, editors, existing }: AppArgs): Action[] | null {
  if (seeded) return null;
  const presets = suggestionsFromDetected(editors).filter((s) => s.key === `${s.appId}:cwd`);
  if (presets.length === 0) return null;
  return presets
    .filter((s) => !hasCommandOf(existing, s.defaultCommand))
    .map((s) => actionFromSuggestion(s));
}

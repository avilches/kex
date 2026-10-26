import { newActionId } from "@/lib/ids";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { agentBinary } from "./agentYolo";
import {
  actionFromSuggestion,
  agentSuggestionsFromDetected,
  hasCommandOf,
  suggestionsFromDetected,
} from "./appSuggestions";
import type { Action } from "./types";

type Args = {
  /** Ids of the agents already offered as an Action, whether or not the user kept it. */
  seen: readonly string[];
  agents: readonly DetectedEditor[];
  existing: readonly Action[];
};

export type AgentSeedPlan = {
  /** The Actions to add. */
  add: Action[];
  /** The agents that were new, to remember so they are not offered again. */
  seen: string[];
};

// A current-directory agent Action counts as the preset whatever flags the user gave it.
const hasAgentActionFor = (existing: readonly Action[], id: string): boolean =>
  existing.some((a) => a.kind === "agent" && a.cwdMode === "context" && agentBinary(a.command) === id);

/** What to seed for the enabled agents never seen before: the current-directory preset of each,
 * with its own button, skipping any the list already has. Null means no agent is new, so the
 * seen list must stay as it is; an empty `add` means every new one is already there. */
export function planAgentSeed({ seen, agents, existing }: Args): AgentSeedPlan | null {
  const known = new Set(seen);
  const presets = agentSuggestionsFromDetected(agents).filter(
    (s) => s.cwdMode === "context" && s.appId && !known.has(s.appId),
  );
  if (presets.length === 0) return null;
  return {
    seen: presets.map((s) => s.appId as string),
    add: presets
      .filter((s) => !hasAgentActionFor(existing, s.appId as string))
      .map((s) => ({
        id: newActionId(),
        name: s.name,
        kind: s.kind,
        command: s.defaultCommand,
        appId: s.appId,
        iconId: s.iconId ?? undefined,
        cwdMode: "context",
        ownButton: true,
      })),
  };
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

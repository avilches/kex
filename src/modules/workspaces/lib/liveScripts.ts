import { scriptActionOf } from "@/modules/actions/lib/actionStateStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { HibernateLive } from "./hibernateReview";
import { getScriptRunningSnapshot } from "./terminalEphemeralStore";
import type { Workspace } from "./types";

// The script half of the live state a hibernate or close review reads: which terminals have
// a script running, and the script Action each one belongs to. Actions are looked up in the
// given workspace and in the global list.
export function liveScripts(ws: Pick<Workspace, "actions"> | undefined): Pick<HibernateLive, "scriptState" | "actionOf"> {
  const marks = getScriptRunningSnapshot();
  const lists = [ws?.actions ?? [], usePreferencesStore.getState().actions ?? []];
  return {
    scriptState: (id) => marks.get(id),
    actionOf: (id) => scriptActionOf(id, lists),
  };
}

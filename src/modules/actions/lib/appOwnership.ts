import { presetOf, type AppSuggestion } from "./appSuggestions";
import type { Action } from "./types";

// What an edit does to the preset link of an app, which depends on its command alone. A
// command that is not what Kex installed makes it the user's own: the appId goes and the icon
// stays as iconId, so the Add menu offers the preset again. A command that is a detected
// preset of the same app again gives the link back. A rename or the own-button choice never
// counts. The empty appId is what clears it: an update merges over the stored action, and a
// missing key would keep the old value.
export function ownedAfterEdit(current: Action, next: Action, presets: readonly AppSuggestion[] = []): Action {
  const app = current.appId || current.iconId;
  if (!app) return next;
  const preset = presetOf(next, presets);
  if (preset?.appId === app) return next.appId === app && !next.iconId ? next : { ...next, appId: app, iconId: "" };
  if (current.appId === undefined) return next;
  if (next.command.trim() === current.command.trim()) return next;
  return { ...next, appId: "", iconId: current.appId };
}

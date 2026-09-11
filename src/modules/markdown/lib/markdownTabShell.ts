import { matchesShortcut } from "@/modules/shortcuts/shortcuts";
import type { ShortcutId, KeyBinding } from "@/modules/shortcuts/shortcuts";

export type MarkdownTabMode = "rich" | "source";

export type MarkdownTabAction = "save" | "toggleSource" | "toggleOutline";

export type SavePlan = { flushRich: boolean; saveDoc: boolean; saveSource: boolean };

export type ModeSwitchPlan = SavePlan & { reload: boolean; nextMode: MarkdownTabMode };

export function planSave(mode: MarkdownTabMode): SavePlan {
  return mode === "rich"
    ? { flushRich: true, saveDoc: true, saveSource: false }
    : { flushRich: false, saveDoc: false, saveSource: true };
}

export function planModeSwitch(mode: MarkdownTabMode): ModeSwitchPlan {
  return mode === "rich"
    ? { ...planSave("rich"), reload: false, nextMode: "source" }
    : { ...planSave("source"), reload: true, nextMode: "rich" };
}

export function routeMarkdownShortcut(
  e: KeyboardEvent,
  userShortcuts: Partial<Record<ShortcutId, KeyBinding[]>>,
  hasOutline: boolean,
): MarkdownTabAction | null {
  const shortcuts = userShortcuts as Record<ShortcutId, KeyBinding[]>;
  if (matchesShortcut(e, "editor.save", shortcuts)) return "save";
  if (matchesShortcut(e, "markdown.toggleSource", shortcuts)) return "toggleSource";
  if (hasOutline && matchesShortcut(e, "markdown.toggleOutline", shortcuts)) {
    return "toggleOutline";
  }
  return null;
}

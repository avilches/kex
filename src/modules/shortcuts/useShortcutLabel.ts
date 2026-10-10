import { usePreferencesStore } from "@/modules/settings/preferences";
import { getShortcutLabel, type ShortcutId } from "./shortcuts";

export function useShortcutLabel(id: ShortcutId): string | null {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  return getShortcutLabel(id, userShortcuts);
}

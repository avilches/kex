import type { ShortcutId } from "@/modules/shortcuts/shortcuts";

// What the switcher lets through while it is open: the two that cycle it. Any other shortcut, including one
// added later, stays blocked so a key cannot act on the tab behind the overlay.
export const SWITCHER_SHORTCUTS: readonly ShortcutId[] = ["tab.switcher", "tab.switcherBack"];

export function shortcutBlockedBySwitcher(id: ShortcutId, open: boolean): boolean {
  return open && !SWITCHER_SHORTCUTS.includes(id);
}

// The native menu has no shortcut id to filter by, and each of its items would act on the tab behind the overlay.
export function menuItemBlockedBySwitcher(open: boolean): boolean {
  return open;
}

import { KEY_SEP } from "@/lib/platform";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  getBindingTokens,
  SHORTCUTS_BY_ID,
  type ShortcutId,
} from "./shortcuts";

// Right-aligned hint for a ContextMenuItem, reading the user's first binding for
// the shortcut (falling back to the default). Renders nothing when the shortcut
// has no binding.
export function ShortcutHint({ id }: { id: ShortcutId }) {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const binding =
    userShortcuts[id]?.[0] ?? SHORTCUTS_BY_ID.get(id)?.defaultBindings[0];
  const tokens = getBindingTokens(binding);
  if (tokens.length === 0) return null;
  return (
    <span className="ml-auto pl-3 text-[11px] tracking-wide text-muted-foreground">
      {tokens.join(KEY_SEP)}
    </span>
  );
}

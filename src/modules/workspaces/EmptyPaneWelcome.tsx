import {
  BrowserIcon,
  CommandIcon,
  SearchIcon,
  Settings01Icon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getShortcutLabel, type ShortcutId } from "@/modules/shortcuts/shortcuts";

export type WelcomeActions = {
  onNewTerminal: () => void;
  onNewBrowser: () => void;
  onSearchFiles: () => void;
  onCommandPalette: () => void;
  onSettings: () => void;
};

export function EmptyPaneWelcome({ actions }: { actions: WelcomeActions }) {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);

  const items: { label: string; icon: IconSvgElement; shortcut: ShortcutId; run: () => void }[] = [
    { label: "New Terminal", icon: TerminalIcon, shortcut: "tab.new", run: actions.onNewTerminal },
    { label: "New Browser", icon: BrowserIcon, shortcut: "tab.newBrowser", run: actions.onNewBrowser },
    { label: "Search Files", icon: SearchIcon, shortcut: "explorer.search", run: actions.onSearchFiles },
    { label: "Command Palette", icon: CommandIcon, shortcut: "commandPalette.open", run: actions.onCommandPalette },
    { label: "Settings", icon: Settings01Icon, shortcut: "settings.open", run: actions.onSettings },
  ];

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-[280px] flex-col gap-1">
        {items.map((it) => {
          const label = getShortcutLabel(it.shortcut, userShortcuts);
          return (
            <button
              key={it.shortcut}
              type="button"
              onClick={it.run}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HugeiconsIcon icon={it.icon} size={16} strokeWidth={2} />
              <span className="flex-1 text-left">{it.label}</span>
              {label && (
                <span className="text-[11px] tabular-nums text-muted-foreground/70">
                  {label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

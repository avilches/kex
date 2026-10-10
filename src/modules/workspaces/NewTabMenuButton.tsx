import { useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BrowserIcon,
  ComputerTerminal01Icon,
  LayoutBottomIcon,
  LayoutRightIcon,
} from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getShortcutLabel, type ShortcutId } from "@/modules/shortcuts/shortcuts";
import { createHoverSwitch } from "./lib/hoverSwitch";

type Props = {
  onNewTerminal: () => void;
  onSplitTerminalRight: () => void;
  onSplitTerminalDown: () => void;
  onNewBrowser: () => void;
  onSplitBrowserRight: () => void;
  onSplitBrowserDown: () => void;
};

const HOVER_ID = "new-tab-menu";

function Shortcut({ id }: { id: ShortcutId }) {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const label = getShortcutLabel(id, userShortcuts);
  return label ? <DropdownMenuShortcut>{label}</DropdownMenuShortcut> : null;
}

// The + of a pane tab strip. A click opens a terminal tab; resting the pointer
// on it (the same delay as hovering a workspace while dragging a tab) or
// right-clicking opens the menu of every New action. The menu is fully
// controlled: its trigger is an inert anchor, so Radix never toggles it from
// the button's own pointer or keyboard events.
export function NewTabMenuButton({
  onNewTerminal,
  onSplitTerminalRight,
  onSplitTerminalDown,
  onNewBrowser,
  onSplitBrowserRight,
  onSplitBrowserDown,
}: Props) {
  const [open, setOpen] = useState(false);
  const hover = useMemo(() => createHoverSwitch(() => setOpen(true)), []);
  useEffect(() => () => hover.cancel(), [hover]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        hover.cancel();
        setOpen(next);
      }}
    >
      <span className="relative ml-1 flex shrink-0">
        <DropdownMenuTrigger asChild>
          <span aria-hidden className="pointer-events-none absolute inset-0" />
        </DropdownMenuTrigger>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          title="New terminal in this pane"
          className="px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => {
            hover.cancel();
            onNewTerminal();
          }}
          onPointerEnter={() => hover.enter(HOVER_ID)}
          onPointerLeave={() => hover.leave(HOVER_ID)}
          onContextMenu={(e) => {
            e.preventDefault();
            hover.cancel();
            setOpen(true);
          }}
        >
          +
        </button>
      </span>
      <DropdownMenuContent
        className="min-w-56"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuItem onSelect={onNewTerminal}>
          <HugeiconsIcon icon={ComputerTerminal01Icon} size={14} strokeWidth={2} />
          New Terminal Tab
          <Shortcut id="tab.new" />
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSplitTerminalRight}>
          <HugeiconsIcon icon={LayoutRightIcon} size={14} strokeWidth={2} />
          New Terminal Split Right
          <Shortcut id="pane.splitRight" />
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSplitTerminalDown}>
          <HugeiconsIcon icon={LayoutBottomIcon} size={14} strokeWidth={2} />
          New Terminal Split Down
          <Shortcut id="pane.splitDown" />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onNewBrowser}>
          <HugeiconsIcon icon={BrowserIcon} size={14} strokeWidth={2} />
          New Browser Tab
          <Shortcut id="tab.newBrowser" />
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSplitBrowserRight}>
          <HugeiconsIcon icon={LayoutRightIcon} size={14} strokeWidth={2} />
          New Browser Split Right
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSplitBrowserDown}>
          <HugeiconsIcon icon={LayoutBottomIcon} size={14} strokeWidth={2} />
          New Browser Split Down
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

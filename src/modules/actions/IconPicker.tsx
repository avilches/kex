import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ActionIcon } from "./ActionIcon";
import { filterIcons, iconOptions, parseIcon, type IconOption } from "./lib/actionIconRefs";
import type { Action } from "./lib/types";

type Props = {
  action: Pick<Action, "appId" | "kind" | "iconId" | "icon">;
  /** Where the popover renders: inside the modal, so its list can scroll. */
  container: HTMLElement | null;
  /** An empty string clears the choice and falls back to the default icon. */
  onPick: (icon: string) => void;
  onOpenChange?: (open: boolean) => void;
};

const TILE = "flex size-8 items-center justify-center rounded-md transition-colors";

// A CommandItem draws a hidden tick after its children and spaces them with a gap; in a 32 px
// tile both push the icon off-center, so the tile drops the gap and the tick.
const TILE_ITEM = "justify-center gap-0 p-0 [&>svg:last-child]:hidden data-selected:bg-accent";

// The icon button of the edit form: it shows the icon the Action has now and opens a searchable
// grid of every icon Kex can draw. Picking saves at once; "Default icon" gives the choice back
// and stays on the list while searching, reachable with the arrow keys like any tile.
export function IconPicker({ action, container, onPick, onOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(() => iconOptions(action.kind), [action.kind]);
  const shown = useMemo(() => filterIcons(options, query), [options, query]);
  const chosen = parseIcon(action.icon);
  const change = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
    onOpenChange?.(next);
  };
  const pick = (icon: string) => {
    onPick(icon);
    change(false);
  };
  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Choose an icon"
          aria-label="Choose an icon"
          aria-haspopup="dialog"
          className={cn(TILE, "shrink-0 border border-input bg-background hover:bg-accent")}
        >
          <ActionIcon action={action} size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" container={container} className="pointer-events-auto w-[288px] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search icons..." value={query} onValueChange={setQuery} />
          <CommandList className="max-h-64">
            <CommandEmpty>No icon found.</CommandEmpty>
            {chosen && (
              <CommandItem
                value="default-icon"
                onSelect={() => pick("")}
                className="mx-1 mt-1 gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                Default icon
              </CommandItem>
            )}
            <div role="listbox" aria-label="Icons" className="grid grid-cols-7 gap-1 p-2">
              {shown.map((o: IconOption) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  title={o.label}
                  aria-label={o.label}
                  onSelect={() => pick(o.value)}
                  className={cn(TILE, TILE_ITEM, o.value === action.icon && "ring-1 ring-foreground/40")}
                >
                  <ActionIcon action={{ kind: action.kind, icon: o.value }} size={16} />
                </CommandItem>
              ))}
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

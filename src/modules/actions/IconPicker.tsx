import { useMemo, useState } from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ActionIcon } from "./ActionIcon";
import { filterIcons, iconOptions, type IconOption } from "./lib/actionIconRefs";
import type { Action } from "./lib/types";

type Props = {
  action: Pick<Action, "kind" | "icon">;
  /** Where the popover renders: inside the modal, so its list can scroll. */
  container: HTMLElement | null;
  onPick: (icon: string) => void;
  onOpenChange?: (open: boolean) => void;
};

const TILE = "flex size-8 items-center justify-center rounded-md transition-colors";

// A CommandItem draws a hidden tick after its children and spaces them with a gap; in a 32 px
// tile both push the icon off-center, so the tile drops the gap and the tick.
const TILE_ITEM = "justify-center gap-0 p-0 [&>svg:last-child]:hidden data-selected:bg-accent";

// The icon button of the edit form: it shows the icon the Action has now and opens a searchable
// grid of every icon Kex can draw. Picking saves at once.
export function IconPicker({ action, container, onPick, onOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(() => iconOptions(action.kind), [action.kind]);
  const shown = useMemo(() => filterIcons(options, query), [options, query]);
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

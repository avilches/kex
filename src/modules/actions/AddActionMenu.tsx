import { Add01Icon, ChevronDownIcon, ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDialogScrollHost } from "@/components/dialogScrollHost";
import { ActionIcon } from "./ActionIcon";
import { ActionNameLines } from "./ActionNameLines";
import { actionRowTitle, actionSubtitle, SETTINGS_LABELS } from "./lib/actionsBar";
import { CUSTOM_APP_SUGGESTION, compareByName, type AppSuggestion } from "./lib/appSuggestions";

type Props = {
  suggestions: readonly AppSuggestion[];
  onAddCommand: () => void;
  onPickApp: (suggestion: AppSuggestion) => void;
};

// The one Add control of a column: a searchable combo whose first entry is Add script, then the
// Applications group: Custom, then one alphabetical entry per detected app preset (icon, and under it what
// the preset points at). Presets keep the combo open so several can be installed in a row;
// the entries that open an editor close it. Installed presets never show up in the list.
export function AddActionMenu({ suggestions, onAddCommand, onPickApp }: Props) {
  const [open, setOpen] = useState(false);
  const host = useDialogScrollHost();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-fit gap-1.5 px-2 text-[12px]" aria-haspopup="listbox">
          <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} />
          Add
          <HugeiconsIcon icon={ChevronDownIcon} size={10} strokeWidth={2} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" container={host} className="pointer-events-auto w-[320px] p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList className="max-h-[min(34rem,calc(var(--radix-popover-content-available-height,34rem)-3.5rem))]">
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="add-script"
                keywords={["script", "command", "terminal"]}
                onSelect={() => {
                  setOpen(false);
                  onAddCommand();
                }}
                className="text-[12px]"
              >
                <span className="flex size-5 shrink-0 items-center justify-center">
                  <HugeiconsIcon icon={ComputerTerminal01Icon} size={13} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1 truncate">Add script</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">runs in a terminal</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Applications">
              <CommandItem
                value={CUSTOM_APP_SUGGESTION.key}
                onSelect={() => {
                  setOpen(false);
                  onPickApp(CUSTOM_APP_SUGGESTION);
                }}
                className="text-[12px]"
              >
                <span className="flex size-5 shrink-0 items-center justify-center">
                  <ActionIcon action={{ runInTerminal: false }} size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate">{CUSTOM_APP_SUGGESTION.name}</span>
              </CommandItem>
              {[...suggestions].sort(compareByName).map((s) => {
                const sub = actionSubtitle(s.name, SETTINGS_LABELS);
                return (
                  <CommandItem
                    key={s.key}
                    value={s.key}
                    keywords={[s.name, s.defaultCommand]}
                    onSelect={() => onPickApp(s)}
                    title={actionRowTitle(s.name, false, null, SETTINGS_LABELS) ?? undefined}
                    className="text-[12px]"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <ActionIcon action={{ appId: s.appId, runInTerminal: false }} size={13} fill />
                      <ActionNameLines
                        name={s.name}
                        value={sub?.text ?? undefined}
                        startTrim={sub?.startTrim}
                      />
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

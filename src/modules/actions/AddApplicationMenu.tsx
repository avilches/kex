import { ChevronDownIcon, DocumentCodeIcon } from "@hugeicons/core-free-icons";
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
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActionIcon } from "./ActionIcon";
import { splitActionName } from "./lib/actionName";
import { CUSTOM_APP_SUGGESTION, compareByName, type AppSuggestion } from "./lib/appSuggestions";

type Props = {
  suggestions: readonly AppSuggestion[];
  onPick: (suggestion: AppSuggestion) => void;
};

// The second add button: a searchable combo over the detected apps, one alphabetical entry
// per preset, every entry carrying its app icon. Custom app starts an empty app row instead.
export function AddApplicationMenu({ suggestions, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const pick = (suggestion: AppSuggestion) => {
    setOpen(false);
    onPick(suggestion);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-fit gap-1.5 px-2 text-[12px]" aria-haspopup="listbox">
          <HugeiconsIcon icon={DocumentCodeIcon} size={12} strokeWidth={2} />
          Add Application
          <HugeiconsIcon icon={ChevronDownIcon} size={10} strokeWidth={2} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="pointer-events-auto w-[360px] p-0">
        <Command>
          <CommandInput placeholder="Search applications..." />
          <CommandList className="max-h-64">
            <CommandEmpty>No application found.</CommandEmpty>
            <CommandGroup>
              {[...suggestions].sort(compareByName).map((s) => {
                const { main, variable } = splitActionName(s.name);
                return (
                  <CommandItem
                    key={s.key}
                    value={s.key}
                    keywords={[s.name, s.defaultCommand]}
                    onSelect={() => pick(s)}
                    className="text-[12px]"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center">
                      <ActionIcon action={{ appId: s.appId, runInTerminal: false }} size={13} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate">{main}</span>
                      {variable && (
                        <span className="truncate font-mono text-[10.5px] text-muted-foreground">{variable}</span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
              <CommandItem
                value={CUSTOM_APP_SUGGESTION.key}
                onSelect={() => pick(CUSTOM_APP_SUGGESTION)}
                className="text-[12px]"
              >
                <span className="flex size-5 shrink-0 items-center justify-center">
                  <ActionIcon action={{ runInTerminal: false }} size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate">{CUSTOM_APP_SUGGESTION.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">write the command yourself</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

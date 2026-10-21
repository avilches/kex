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
import { useDialogScrollHost } from "@/components/dialogScrollHost";
import { ActionIcon } from "./ActionIcon";
import { ActionNameLines } from "./ActionNameLines";
import { actionRowTitle, actionSubtitle } from "./lib/actionsBar";
import { CUSTOM_APP_SUGGESTION, compareByName, type AppSuggestion } from "./lib/appSuggestions";
import type { ActionContext } from "./lib/useActionContext";

type Props = {
  suggestions: readonly AppSuggestion[];
  context: ActionContext | null;
  onPick: (suggestion: AppSuggestion) => void;
};

// The searchable combo over the detected apps: one alphabetical entry per preset, every
// entry carrying its app icon and, under it, what the preset points at here ("Workspace",
// the file name, the folder path). It stays open on a pick so several presets can be
// installed in a row; the installed ones never show up in the list.
export function AddApplicationMenu({ suggestions, context, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const host = useDialogScrollHost();
  const pick = (suggestion: AppSuggestion) => onPick(suggestion);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-fit gap-1.5 px-2 text-[12px]" aria-haspopup="listbox">
          <HugeiconsIcon icon={DocumentCodeIcon} size={12} strokeWidth={2} />
          Add Application
          <HugeiconsIcon icon={ChevronDownIcon} size={10} strokeWidth={2} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" container={host} className="pointer-events-auto w-[360px] p-0">
        <Command>
          <CommandInput placeholder="Search applications..." />
          <CommandList className="max-h-64">
            <CommandEmpty>No application found.</CommandEmpty>
            <CommandGroup>
              {[...suggestions].sort(compareByName).map((s) => {
                const sub = context ? actionSubtitle(s.name, context) : null;
                return (
                  <CommandItem
                    key={s.key}
                    value={s.key}
                    keywords={[s.name, s.defaultCommand]}
                    onSelect={() => pick(s)}
                    title={context ? (actionRowTitle(s.name, false, null, context) ?? undefined) : undefined}
                    className="text-[12px]"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center">
                      <ActionIcon action={{ appId: s.appId, runInTerminal: false }} size={13} />
                    </span>
                    <ActionNameLines
                      name={s.name}
                      value={sub?.text ?? undefined}
                      startTrim={sub?.startTrim}
                    />
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

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { GitWorktreeInfo } from "@/lib/native";
import { cn } from "@/lib/utils";
import { StructureFolderIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

type Props = {
  label: string;
  onFetchWorktrees: () => Promise<GitWorktreeInfo[]>;
  onSelect: (path: string) => void;
};

export function WorktreePicker({ label, onFetchWorktrees, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [worktrees, setWorktrees] = useState<GitWorktreeInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setWorktrees(null);
      setSearch("");
      return;
    }
    setLoading(true);
    try {
      const list = await onFetchWorktrees();
      // current first
      setWorktrees([...list].sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0)));
    } catch {
      setWorktrees([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1 text-[11.5px] font-medium leading-tight text-foreground transition-colors hover:bg-foreground/10"
        >
          <HugeiconsIcon
            icon={StructureFolderIcon}
            size={14}
            strokeWidth={1.9}
            className="shrink-0 text-muted-foreground"
          />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[420px] max-w-[calc(100vw-2rem)] p-0"
        align="start"
        side="bottom"
      >
        <Command>
          <CommandInput
            placeholder="Filter worktrees..."
            className="h-8 text-[11.5px]"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[60vh] pt-1">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner className="size-4" />
              </div>
            ) : (
              <>
                <CommandEmpty className="py-3 text-center text-[11px] text-muted-foreground">
                  No worktrees found
                </CommandEmpty>
                {(worktrees ?? []).map((wt) => {
                  const name = wt.isMain
                    ? "Main worktree"
                    : (wt.branch ?? wt.path.split("/").pop() ?? wt.path);
                  return (
                    <CommandItem
                      key={wt.path}
                      value={name}
                      onSelect={() => {
                        if (!wt.isCurrent) onSelect(wt.path);
                        setOpen(false);
                        setSearch("");
                      }}
                      className="rounded-md py-1"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <HugeiconsIcon
                            icon={StructureFolderIcon}
                            size={11}
                            strokeWidth={1.9}
                            className={cn(
                              "shrink-0",
                              wt.isCurrent ? "text-foreground" : "text-muted-foreground",
                            )}
                          />
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-[11.5px] font-medium",
                              wt.isCurrent ? "text-foreground" : "text-foreground/85",
                            )}
                          >
                            {name}
                          </span>
                          {wt.isCurrent && (
                            <HugeiconsIcon
                              icon={Tick02Icon}
                              size={11}
                              strokeWidth={2}
                              className="shrink-0 text-muted-foreground"
                            />
                          )}
                        </div>
                        <span className="ml-[19px] min-w-0 truncate text-[10px] text-muted-foreground/60">
                          {wt.path}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

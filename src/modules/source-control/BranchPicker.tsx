import {
  Command,
  CommandEmpty,
  CommandGroup,
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
import type { GitBranchInfo } from "@/lib/native";
import { cn } from "@/lib/utils";
import { Add01Icon, GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

type Props = {
  currentBranch: string;
  isDetached: boolean;
  disabled: boolean;
  onFetchBranches: () => Promise<GitBranchInfo[]>;
  onCheckout: (branch: GitBranchInfo) => Promise<void>;
  onCreateBranch?: (name: string) => Promise<void>;
};

export function BranchPicker({
  currentBranch,
  isDetached,
  disabled,
  onFetchBranches,
  onCheckout,
  onCreateBranch,
}: Props) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranchInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setBranches(null);
      setSearchValue("");
      return;
    }
    setLoading(true);
    try {
      setBranches(await onFetchBranches());
    } catch {
      setBranches([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (name: string) => {
    if (!onCreateBranch) return;
    setBusyName(name);
    try {
      await onCreateBranch(name);
      setOpen(false);
      setSearchValue("");
    } catch {
      // error shown via actionError toast
    } finally {
      setBusyName(null);
    }
  };

  const handleSelect = async (branch: GitBranchInfo) => {
    if (branch.isCurrent) {
      setOpen(false);
      return;
    }
    setBusyName(branch.name);
    try {
      await onCheckout(branch);
      // Refresh list so new current is reflected
      setBranches(await onFetchBranches());
      setOpen(false);
    } catch {
      // Parent shows the error via actionError toast
    } finally {
      setBusyName(null);
    }
  };

  const label = isDetached ? "detached" : currentBranch;

  if (isDetached || disabled) {
    return (
      <div className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1 text-[11.5px] font-medium leading-tight text-foreground">
        <HugeiconsIcon
          icon={GitBranchIcon}
          size={14}
          strokeWidth={1.9}
          className="shrink-0 text-muted-foreground"
        />
        <span className="truncate">{label}</span>
      </div>
    );
  }

  const localBranches = (branches ?? []).filter((b) => !b.isRemote);
  const remoteBranches = (branches ?? []).filter((b) => b.isRemote);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1 text-[11.5px] font-medium leading-tight text-foreground transition-colors hover:bg-foreground/10"
        >
          <HugeiconsIcon
            icon={GitBranchIcon}
            size={14}
            strokeWidth={1.9}
            className="shrink-0 text-muted-foreground"
          />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" side="bottom">
        <Command>
          <CommandInput
            placeholder="Filter branches..."
            className="h-8 text-[11.5px]"
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList className="max-h-64">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner className="size-4" />
              </div>
            ) : (
              <>
                <CommandEmpty className="py-3 text-center text-[11px] text-muted-foreground">
                  No branches found
                </CommandEmpty>
                {localBranches.length > 0 && (
                  <CommandGroup heading="Local">
                    {localBranches.map((b) => (
                      <BranchItem
                        key={b.name}
                        branch={b}
                        busyName={busyName}
                        onSelect={handleSelect}
                      />
                    ))}
                  </CommandGroup>
                )}
                {remoteBranches.length > 0 && (
                  <CommandGroup heading="Remote">
                    {remoteBranches.map((b) => (
                      <BranchItem
                        key={b.name}
                        branch={b}
                        busyName={busyName}
                        onSelect={handleSelect}
                      />
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
          {searchValue.trim() && onCreateBranch ? (
            <div className="border-t border-border/40 p-1">
              <button
                type="button"
                disabled={!!busyName}
                onClick={() => void handleCreate(searchValue.trim())}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors hover:bg-accent disabled:opacity-50"
              >
                {busyName === searchValue.trim() ? (
                  <Spinner className="size-3 shrink-0" />
                ) : (
                  <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={1.9} className="shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 truncate">
                  Create <span className="font-semibold">"{searchValue.trim()}"</span>
                </span>
              </button>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function BranchItem({
  branch,
  busyName,
  onSelect,
}: {
  branch: GitBranchInfo;
  busyName: string | null;
  onSelect: (b: GitBranchInfo) => void;
}) {
  const isBusy = busyName === branch.name;
  const isLocked = !!branch.worktree;
  return (
    <CommandItem
      value={branch.name}
      onSelect={() => {
        if (isLocked) return;
        onSelect(branch);
      }}
      disabled={isLocked}
      className={cn(
        "flex items-center gap-2 rounded-md text-[11.5px]",
        branch.isCurrent && "font-semibold",
        isLocked && "opacity-50 cursor-default",
      )}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {isBusy ? (
          <Spinner className="size-3" />
        ) : (
          <HugeiconsIcon
            icon={GitBranchIcon}
            size={14}
            strokeWidth={1.9}
            className={cn(
              branch.isCurrent
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{branch.name}</span>
      {branch.isCurrent && (
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          current
        </span>
      )}
      {isLocked && (
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          wt
        </span>
      )}
    </CommandItem>
  );
}

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { GitWorktreeInfo } from "@/lib/native";
import { cn } from "@/lib/utils";
import { StructureFolderIcon } from "@hugeicons/core-free-icons";
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

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setWorktrees(null);
      return;
    }
    setLoading(true);
    try {
      setWorktrees(await onFetchWorktrees());
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
      <PopoverContent className="w-72 p-0" align="start" side="bottom">
        <div className="p-1 space-y-0.5">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner className="size-4" />
            </div>
          ) : worktrees && worktrees.length === 0 ? (
            <div className="py-3 text-center text-[11px] text-muted-foreground">
              No worktrees found
            </div>
          ) : (
            (worktrees ?? []).map((wt) => (
              <button
                key={wt.path}
                type="button"
                disabled={wt.isCurrent}
                onClick={() => {
                  if (wt.isCurrent) return;
                  onSelect(wt.path);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full flex-col rounded-sm px-2 py-1.5 text-left transition-colors",
                  wt.isCurrent
                    ? "cursor-default bg-accent/50"
                    : "hover:bg-accent",
                )}
              >
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
                      "truncate text-[11.5px] font-medium",
                      wt.isCurrent ? "text-foreground" : "text-foreground/85",
                    )}
                  >
                    {wt.isMain ? "Main worktree" : wt.branch ?? wt.path.split("/").pop()}
                  </span>
                  {wt.isCurrent && (
                    <span className="ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      current
                    </span>
                  )}
                </div>
                <span className="ml-[19px] min-w-0 truncate text-[10px] text-muted-foreground/70">
                  {wt.path}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

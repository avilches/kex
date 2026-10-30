import { cn } from "@/lib/utils";
import { ArrowRight01Icon, PinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { folderIconUrl } from "./lib/iconResolver";
import { COMPACT_CONTENT, COMPACT_ITEM } from "./lib/menuItemClass";
import { MISSING_ROOT_ITEM } from "./SetWorkspaceRootItem";

const FOLDERS = ["projects", "notes"];

// A static picture of the explorer: two folders and the context menu of the second one, with the
// same highlighted entry the real menu shows while the workspace has no root. Not interactive.
export function SetRootHint() {
  return (
    <div
      aria-hidden
      className="pointer-events-none relative mt-2 h-[88px] select-none overflow-hidden rounded-md bg-sidebar ring-1 ring-border/60"
    >
      <div className="flex flex-col py-1">
        {FOLDERS.map((name, i) => (
          <div
            key={name}
            className={cn(
              "flex h-6 w-full items-center gap-2 rounded-sm px-1.5 text-[13px] text-foreground/85",
              i === 1 && "bg-accent/70",
            )}
          >
            <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
              <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={2.25} />
            </span>
            <img src={folderIconUrl("", false)} alt="" className="size-4 shrink-0" />
            <span className="truncate">{name}</span>
          </div>
        ))}
      </div>
      <div
        className={cn(
          COMPACT_CONTENT,
          "absolute left-10 top-9 rounded-menu bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10",
        )}
      >
        <div
          className={cn(
            "flex items-center rounded-menu-item bg-accent font-medium",
            COMPACT_ITEM,
            MISSING_ROOT_ITEM,
          )}
        >
          <HugeiconsIcon icon={PinIcon} size={14} strokeWidth={2} className="shrink-0 text-primary" />
          Set as Workspace Root
        </div>
      </div>
    </div>
  );
}

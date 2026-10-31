import { cn } from "@/lib/utils";
import { ArrowRight01Icon, DashboardSquareAddIcon, PinIcon, Rocket01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { folderIconUrl } from "./lib/iconResolver";
import { COMPACT_CONTENT, COMPACT_ITEM } from "./lib/menuItemClass";
import { MISSING_ROOT_ITEM } from "./SetWorkspaceRootItem";

type MockRow = { name: string; depth: number; open?: boolean; target?: boolean };

const ROWS: MockRow[] = [
  { name: "archive", depth: 0 },
  { name: "projects", depth: 0, open: true },
  { name: "finances", depth: 1 },
  { name: "secret-game", depth: 1, target: true },
  { name: "kex-cli", depth: 1 },
  { name: "notes", depth: 0 },
  { name: "scripts", depth: 0 },
];

// A static picture of the explorer, faded at top and bottom like a screenshot: some folders and the context menu of one of them, with a mouse cursor, with the
// same highlighted entry the real menu shows while the workspace has no root. Not interactive.
export function SetRootHint() {
  return (
    <div
      aria-hidden
      className="pointer-events-none relative mt-2 ml-4 h-[200px] select-none overflow-hidden rounded-md bg-sidebar ring-1 ring-border/60"
    >
      <div className="flex flex-col py-2 pl-6">
        {ROWS.map((row) => (
          <div
            key={row.name}
            style={{ paddingLeft: 6 + row.depth * 16 }}
            className={cn(
              "flex h-6 w-full items-center gap-2 rounded-sm pr-1.5 text-[13px] text-foreground/85",
              row.target && "bg-accent/70",
            )}
          >
            <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={12}
                strokeWidth={2.25}
                className={cn(row.open && "rotate-90")}
              />
            </span>
            <img src={folderIconUrl("", !!row.open)} alt="" className="size-4 shrink-0" />
            <span className="truncate">{row.name}</span>
          </div>
        ))}
      </div>
      <div
        className={cn(
          COMPACT_CONTENT,
          "absolute left-28 top-[86px] w-max rounded-menu bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10",
        )}
      >
        <div className={cn("flex items-center whitespace-nowrap", COMPACT_ITEM)}>
          <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} className="shrink-0" />
          Actions
        </div>
        <div
          className={cn(
            "flex items-center whitespace-nowrap rounded-menu-item bg-accent font-medium",
            COMPACT_ITEM,
            MISSING_ROOT_ITEM,
          )}
        >
          <HugeiconsIcon icon={PinIcon} size={14} strokeWidth={2} className="shrink-0 text-primary" />
          Set as Workspace Root
        </div>
        <div className={cn("flex items-center whitespace-nowrap", COMPACT_ITEM)}>
          <HugeiconsIcon icon={DashboardSquareAddIcon} size={14} strokeWidth={2} className="shrink-0" />
          New Workspace from Folder
        </div>
      </div>
      <svg
        viewBox="0 0 16 22"
        className="absolute left-[14.5rem] top-[128px] h-[22px] w-4 drop-shadow-md"
      >
        <path
          d="M1 1v17l4.5-4 3 7 3-1.3-3-6.7H14z"
          fill="white"
          stroke="black"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-sidebar via-sidebar/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-sidebar via-sidebar/80 to-transparent" />
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type DiffViewMode,
  setDiffViewMode,
  setEditorViewForExt,
} from "@/modules/settings/store";
import {
  LayoutTwoColumnIcon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type EditorViewSettings,
  extOf,
} from "./lib/editorViewSettings";
import { EditorPathBreadcrumb } from "./EditorPathBreadcrumb";
import { diffRenameLabel } from "./lib/diffRename";

type Props = {
  path: string;
  originalPath: string | null;
  repoRoot: string;
  mode: "-" | "+";
  chipLabel?: string;
  useFallback: boolean;
  isBinary: boolean;
  isTooLarge: boolean;
  truncated: boolean;
  stats: { added: number; removed: number };
  view: EditorViewSettings;
  diffViewMode: DiffViewMode;
  workspaceRoot: string | null;
  home: string | null;
  onRevealPath: (path: string) => void;
};

export function GitDiffPathBar({
  path,
  originalPath,
  repoRoot,
  mode,
  chipLabel,
  useFallback,
  isBinary,
  isTooLarge,
  truncated,
  stats,
  view,
  diffViewMode,
  workspaceRoot,
  home,
  onRevealPath,
}: Props) {
  const renameFrom = diffRenameLabel(path, originalPath);
  const ext = extOf(path);
  const keepOpen = (e: Event) => e.preventDefault();
  const set = (patch: Partial<EditorViewSettings>) =>
    void setEditorViewForExt(ext, { ...view, ...patch });
  const isSplit = diffViewMode === "split";

  return (
    <div className="flex h-6 w-full shrink-0 items-center gap-2 border-b border-border/60 bg-background px-2 text-[11px]">
      <Badge
        variant="outline"
        className="shrink-0 text-[10px] uppercase tracking-wide"
      >
        {chipLabel ?? (mode === "+" ? "Staged Changes" : "Changes")}
      </Badge>
      {renameFrom ? (
        <span
          className="shrink-0 truncate font-mono text-[10px] text-muted-foreground"
          title={originalPath ?? undefined}
        >
          from {renameFrom}
        </span>
      ) : null}
      <EditorPathBreadcrumb
        path={path}
        workspaceRoot={workspaceRoot}
        home={home}
        onRevealPath={onRevealPath}
      />
      <div className="ml-auto flex shrink-0 items-center gap-2 text-[10.5px] tabular-nums text-muted-foreground">
        {isBinary ? (
          <Badge variant="secondary" className="text-[10px]">
            Binary / patch fallback
          </Badge>
        ) : isTooLarge ? (
          <Badge variant="secondary" className="text-[10px]">
            Large file / patch view
          </Badge>
        ) : null}
        {truncated ? (
          <Badge
            variant="secondary"
            className="text-[10px] text-amber-600 dark:text-amber-400"
            title="The diff exceeded the size limit and was truncated; content may be incomplete."
          >
            Truncated
          </Badge>
        ) : null}
        {useFallback ? (
          <>
            <span className="text-emerald-600 dark:text-emerald-400">
              +{stats.added}
            </span>
            <span className="text-rose-600 dark:text-rose-400">
              -{stats.removed}
            </span>
          </>
        ) : null}
        <span className="hidden truncate font-mono lg:inline max-w-60">
          {repoRoot}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={useFallback}
            onClick={() =>
              void setDiffViewMode(isSplit ? "unified" : "split")
            }
            title={isSplit ? "Unified view" : "Side-by-side view"}
            className={
              isSplit
                ? "flex size-[22px] items-center justify-center rounded text-foreground transition-colors disabled:pointer-events-none disabled:opacity-30"
                : "flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            }
          >
            <HugeiconsIcon icon={LayoutTwoColumnIcon} size={13} strokeWidth={2} />
          </button>
          {!useFallback ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="View options"
                  className="flex size-[22px] items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:text-foreground"
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-[12px]">
                <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                  {ext ? `.${ext}` : "this file type"} files
                </DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={view.wrap}
                  onSelect={keepOpen}
                  onCheckedChange={(c) => set({ wrap: !!c })}
                >
                  Word wrap
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={view.lineNumbers}
                  onSelect={keepOpen}
                  onCheckedChange={(c) => set({ lineNumbers: !!c })}
                >
                  Line numbers
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </div>
  );
}

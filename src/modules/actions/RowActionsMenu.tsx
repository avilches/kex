import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Rocket01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { IS_WINDOWS } from "@/lib/platform";
import { pathDirname } from "@/lib/pathUtils";
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useDirGit } from "@/modules/workspaces/lib/dirGitStore";
import { scriptShellFor } from "@/modules/workspaces/lib/scriptCwd";
import { useSystemInfo } from "@/modules/workspaces/lib/systemInfoStore";
import type { Tab, Workspace } from "@/modules/workspaces/lib/types";
import { COMPACT_CONTENT, COMPACT_ITEM } from "@/modules/explorer/lib/menuItemClass";
import { buildCommandVars } from "@/modules/actions/lib/commandVars";
import type { RunOverlay } from "@/modules/actions/lib/useActionRunner";
import { contextActionEntries, type ContextActionEntry, type ContextActionKind } from "@/modules/actions/lib/contextActionEntries";
import { ActionIcon } from "@/modules/actions/ActionIcon";
import { ActionNameLines } from "@/modules/actions/ActionNameLines";
import type { Action } from "@/modules/actions/lib/types";

const NONE: readonly Action[] = [];

type MenuWorkspace = Pick<Workspace, "actions" | "cwd" | "workspaceRoot" | "hibernated"> | null;

// A place a menu opened on, seen as the tab an Action would run from: the row itself is
// the terminal of a folder row and the editor of a file row, so the same values the Header
// bar and the runner build land here too.
function rowTab(kind: ContextActionKind, path: string): Tab | null {
  if (!path) return null;
  return kind === "file"
    ? { id: "ctx-file", kind: "editor", path, dirty: false, preview: false, title: "" }
    : { id: "ctx-folder", kind: "terminal", cwd: path, title: "" };
}

export type ContextActions = {
  entries: ContextActionEntry[];
  overlay: RunOverlay | null;
};

export function useContextActions(ws: MenuWorkspace, kind: ContextActionKind, path: string): ContextActions {
  const sys = useSystemInfo();
  const envKind = useWorkspaceEnvStore((s) => s.env.kind);
  const global = usePreferencesStore((s) => s.actions) ?? NONE;
  const dir = kind === "file" ? (path ? pathDirname(path) : "") : path;
  const info = useDirGit(dir || undefined, path ? `ctx-${kind}:${path}` : undefined);
  const tab = useMemo(() => rowTab(kind, path), [kind, path]);
  const vars = useMemo(
    () =>
      tab && ws
        ? buildCommandVars(tab, { cwd: ws.cwd, workspaceRoot: ws.workspaceRoot }, { branch: info.branch, repoRoot: info.repoRoot }, sys.host)
        : null,
    [tab, ws, info.branch, info.repoRoot, sys.host],
  );
  const shell = scriptShellFor(IS_WINDOWS, envKind);
  const entries = useMemo(
    () =>
      vars
        ? contextActionEntries([...(ws?.actions ?? []), ...global], kind, { vars, shell, hibernated: !!ws?.hibernated })
        : [],
    [vars, global, kind, shell, ws?.actions, ws?.hibernated],
  );
  const overlay = useMemo<RunOverlay | null>(
    () => (vars ? { vars, focusFolder: vars.cwd || undefined, spawnCwd: vars.cwd || undefined } : null),
    [vars],
  );
  return { entries, overlay };
}

type ActionMenuApi = {
  run: (action: Action, overlay?: RunOverlay) => void;
  /** The workspace the menu is in: the row finds its own values from it. */
  ws: MenuWorkspace;
};

const ApiCtx = createContext<ActionMenuApi | null>(null);

export function ActionMenuProvider({
  run,
  ws,
  children,
}: {
  run: (action: Action, overlay?: RunOverlay) => void;
  ws: MenuWorkspace;
  children: ReactNode;
}) {
  return <ApiCtx.Provider value={{ run, ws }}>{children}</ApiCtx.Provider>;
}

// The Actions entry of a context menu: a submenu with the folder Actions of a folder row
// or the file Actions of a file row (the workspace Actions live in the Header alone), the
// unfillable ones muted with why, each running against the folder or file of the row.
// Nothing is rendered while there are no Actions or the row has no path.
export function RowActionsMenu({ kind, path: given }: { kind: ContextActionKind; path: string }) {
  const api = useContext(ApiCtx);
  const run = api?.run;
  const ws = api?.ws ?? null;
  const path = given || (kind === "folder" ? (ws?.workspaceRoot ?? ws?.cwd ?? "") : "");
  const { entries, overlay } = useContextActions(ws, kind, path);
  if (!run || !overlay || entries.length === 0) return null;
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="gap-2">
        <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} />
        Actions
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className={cn(COMPACT_CONTENT, "min-w-64")}>
        {entries.map((entry) => (
          <ContextMenuItem
            key={entry.action.id}
            title={entry.reason ?? undefined}
            disabled={!entry.enabled}
            className={COMPACT_ITEM}
            onSelect={() => run(entry.action, overlay)}
          >
            <ActionIcon action={entry.action} size={14} />
            <span className={cn("min-w-0 flex-1", !entry.enabled && "opacity-60")}>
              <ActionNameLines name={entry.action.name} value={entry.subtitle} />
            </span>
            {!entry.enabled && entry.reason && (
              <span className="shrink-0 text-[10px] text-muted-foreground/70">{entry.reason}</span>
            )}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

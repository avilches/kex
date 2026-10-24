import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Rocket01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { IS_WINDOWS } from "@/lib/platform";
import { pathDirname } from "@/lib/pathUtils";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
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
import { contextActionEntries, type ContextActionEntry, type ContextActionGroups, type ContextActionKind } from "@/modules/actions/lib/contextActionEntries";
import { WORKSPACE_UNSET } from "@/modules/actions/lib/actionsBar";
import { ActionIcon } from "@/modules/actions/ActionIcon";
import { ActionNameLines } from "@/modules/actions/ActionNameLines";
import type { Action } from "@/modules/actions/lib/types";

const NONE: readonly Action[] = [];
const EMPTY_GROUPS: ContextActionGroups = { workspace: [], global: [] };

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
  groups: ContextActionGroups;
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
  const groups = useMemo(
    () =>
      vars
        ? contextActionEntries(ws?.actions ?? NONE, global, { vars, shell, hibernated: !!ws?.hibernated })
        : EMPTY_GROUPS,
    [vars, global, shell, ws?.actions, ws?.hibernated],
  );
  const overlay = useMemo<RunOverlay | null>(
    () => (vars ? { vars, focusFolder: vars.cwd || undefined, spawnCwd: vars.cwd || undefined } : null),
    [vars],
  );
  return { groups, overlay };
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

function EntryItem({ entry, overlay, run }: { entry: ContextActionEntry; overlay: RunOverlay; run: (action: Action, overlay?: RunOverlay) => void }) {
  return (
    <ContextMenuItem
      title={entry.reason ?? entry.title ?? undefined}
      disabled={!entry.enabled}
      className={COMPACT_ITEM}
      onSelect={() => run(entry.action, overlay)}
    >
      <ActionIcon action={entry.action} size={14} />
      <span className={cn("min-w-0 flex-1", !entry.enabled && "opacity-60")}>
        <ActionNameLines name={entry.action.name} value={entry.subtitle} startTrim={entry.subtitleTrim} />
      </span>
      {!entry.enabled && entry.reason && entry.subtitle !== WORKSPACE_UNSET && (
        <span className="shrink-0 text-[10px] text-muted-foreground/70">{entry.reason}</span>
      )}
    </ContextMenuItem>
  );
}

// The Actions entry of a context menu: a submenu with every Action, laid out like the Header
// combo (workspace ones first, global after, apps before scripts), the unfillable ones muted
// with why, each running against the folder or file of the row. Nothing is rendered while
// there are no Actions or the row has no path.
export function RowActionsMenu({ kind, path: given }: { kind: ContextActionKind; path: string }) {
  const api = useContext(ApiCtx);
  const run = api?.run;
  const ws = api?.ws ?? null;
  const path = given || (kind === "folder" ? (ws?.workspaceRoot ?? ws?.cwd ?? "") : "");
  const { groups, overlay } = useContextActions(ws, kind, path);
  if (!run || !overlay || groups.workspace.length + groups.global.length === 0) return null;
  const sections = [
    { label: "Workspace actions", entries: groups.workspace },
    { label: "Global actions", entries: groups.global },
  ].filter((section) => section.entries.length > 0);
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="gap-2">
        <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} />
        Actions
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className={cn(COMPACT_CONTENT, "min-w-64")}>
        {sections.map((section, i) => (
          <div key={section.label}>
            {i > 0 && <ContextMenuSeparator />}
            <ContextMenuLabel className="px-2 py-1 text-[10px]">{section.label}</ContextMenuLabel>
            {section.entries.map((entry) => (
              <EntryItem key={entry.action.id} entry={entry} overlay={overlay} run={run} />
            ))}
          </div>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

import { useCallback, type MutableRefObject } from "react";
import { toast } from "sonner";
import { IS_WINDOWS } from "@/lib/platform";
import { newTabId } from "@/lib/ids";
import { native } from "@/lib/native";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import { requestLeafFocus } from "@/modules/terminal/lib/useTerminalSession";
import { getDirGit } from "@/modules/workspaces/lib/dirGitStore";
import { scriptFolderMissingMessage, scriptShellFor } from "@/modules/workspaces/lib/scriptCwd";
import { planDelayedWrite } from "@/modules/workspaces/lib/scriptRunState";
import { allPanes, findPane, focusedTab, focusedTabId } from "@/modules/workspaces/lib/splitNode";
import { flashTab } from "@/modules/workspaces/lib/tabFlashStore";
import {
  getScriptRunningSnapshot,
  setScriptCommand,
  setScriptRunning,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { getSystemInfo } from "@/modules/workspaces/lib/systemInfoStore";
import { workspaceDir } from "@/modules/workspaces/lib/titleVars";
import { buildCommandVars } from "./commandVars";
import type { Tab, Workspace } from "@/modules/workspaces/lib/types";
import {
  pickRunnableAction,
  planActionRun,
  planActionStop,
  planTabReveal,
  type LinkedTab,
  type RunContext,
} from "./actionRun";
import { getActionTab, linkActionTab } from "./actionStateStore";
import type { Action } from "./types";

// Values a run takes from where it was launched instead of the focused tab: the context
// menus (explorer rows, breadcrumbs, tabs) run an Action against their own folder or file.
export type RunOverlay = {
  /** The full map of values the row stands for; it replaces the focused tab's. */
  vars?: RunContext["vars"];
  focusFolder?: string;
  /** Where a spawned app is launched from; the folder or file folder of the row. */
  spawnCwd?: string;
};

type TerminalHandle = { write: (data: string) => void };

type Found = { workspace: Workspace; pane: { id: string }; tab: Tab } | null;

// The pieces of App the runner drives; all of them already exist in useWorkspaces.
export type ActionRunnerDeps = {
  activeWorkspace: Workspace | undefined;
  activeWorkspaceId: string;
  findTabGlobal: (tabId: string) => Found;
  setActiveWorkspaceId: (id: string) => void;
  activateTab: (workspaceId: string, tabId: string) => void;
  revealTab: (workspaceId: string, tabId: string) => void;
  focusPane: (workspaceId: string, paneId: string) => void;
  openTab: (workspaceId: string, paneId: string, tab: Tab) => void;
  splitPaneAndOpenTab: (
    workspaceId: string,
    targetPaneId: string,
    direction: "left" | "right" | "top" | "bottom",
    tab: Tab,
  ) => string;
  setScriptPaneId: (workspaceId: string, paneId: string) => void;
  terminalHandles: MutableRefObject<Map<string, TerminalHandle>>;
  scriptCommandSeen: MutableRefObject<Set<string>>;
  /** Folder of the focused tab, with the agent worktree already applied. */
  focusFolder: MutableRefObject<string | null>;
};

const WRITE_DELAY_NEW_MS = 150;
const WRITE_DELAY_REUSED_MS = 50;
const WRITE_RETRY_MS = 100;

function linkFor(actionId: string, deps: ActionRunnerDeps): LinkedTab | null {
  const tabId = getActionTab(actionId);
  if (!tabId) return null;
  const found = deps.findTabGlobal(tabId);
  const mark = getScriptRunningSnapshot().get(tabId);
  const terminal = found?.tab.kind === "terminal";
  return {
    tabId,
    exists: !!found,
    terminal,
    markRunning: !!mark,
    foreignCommand: terminal && !mark && deps.scriptCommandSeen.current.has(tabId),
    cwd: found && found.tab.kind === "terminal" ? found.tab.cwd : undefined,
  };
}

function contextFor(action: Action, ws: Workspace, deps: ActionRunnerDeps, overlay?: RunOverlay): RunContext {
  const focused = focusedTab(ws.paneTree, ws.activePaneId);
  const info = getDirGit(workspaceDir(ws, focused));
  const { workspacePaneLimit } = usePreferencesStore.getState();
  return {
    hibernated: !!ws.hibernated,
    shell: scriptShellFor(IS_WINDOWS, useWorkspaceEnvStore.getState().env.kind),
    vars: { ...buildCommandVars(focused, ws, info, getSystemInfo().host), ...overlay?.vars },
    folders: { focusFolder: overlay?.focusFolder ?? deps.focusFolder.current, workspaceRoot: ws.workspaceRoot, workspaceCwd: ws.cwd },
    link: action.runInTerminal ? linkFor(action.id, deps) : null,
    scriptPaneExists: !!ws.scriptPaneId && !!findPane(ws.paneTree, ws.scriptPaneId),
    atPaneLimit: allPanes(ws.paneTree).length >= workspacePaneLimit,
  };
}

export function useActionRunner(deps: ActionRunnerDeps) {
  const {
    activeWorkspace,
    activeWorkspaceId,
    findTabGlobal,
    setActiveWorkspaceId,
    activateTab,
    revealTab,
    focusPane,
    openTab,
    splitPaneAndOpenTab,
    setScriptPaneId,
    terminalHandles,
    scriptCommandSeen,
  } = deps;

  const scheduleWrite = useCallback(
    (tabId: string, input: string, delay: number) => {
      const attempt = (n: number) => {
        const step = planDelayedWrite(getScriptRunningSnapshot().get(tabId), terminalHandles.current.has(tabId), n);
        if (step === "write") terminalHandles.current.get(tabId)?.write(input);
        else if (step === "retry") setTimeout(() => attempt(n + 1), WRITE_RETRY_MS);
        else setScriptRunning(tabId, false);
      };
      setTimeout(() => attempt(0), delay);
    },
    [terminalHandles],
  );

  /**
   * Brings a script's tab into view: like the old Run button, wherever it lives. A reveal in
   * another pane keeps the focus where the user is, unless the caller asks for it: clicking a
   * script's name is a request to go there, a run that finds its tab already open is not.
   */
  const revealActionTab = useCallback(
    (tabId: string, takeFocus = false): boolean => {
      const found = findTabGlobal(tabId);
      if (!found || !activeWorkspace) return false;
      const plan = planTabReveal({
        tabWorkspaceId: found.workspace.id,
        tabPaneId: found.pane.id,
        activeWorkspaceId,
        userPaneId: activeWorkspace.activePaneId,
      });
      if (plan.switchWorkspace) setActiveWorkspaceId(found.workspace.id);
      if (plan.mode === "activate") {
        activateTab(found.workspace.id, tabId);
        requestLeafFocus(tabId);
      } else {
        const userLeaf = focusedTabId(found.workspace.paneTree, found.workspace.activePaneId);
        revealTab(found.workspace.id, tabId);
        if (takeFocus) requestLeafFocus(tabId);
        else if (userLeaf) requestLeafFocus(userLeaf);
      }
      return true;
    },
    [activeWorkspace, activeWorkspaceId, activateTab, findTabGlobal, revealTab, setActiveWorkspaceId],
  );

  const openScriptTab = useCallback(
    (ws: Workspace, tab: Tab, placement: "scripts-pane" | "split-scripts-pane" | "active-pane") => {
      const userPaneId = ws.activePaneId;
      const userLeaf = focusedTabId(ws.paneTree, userPaneId);
      if (placement === "scripts-pane" && ws.scriptPaneId) {
        openTab(ws.id, ws.scriptPaneId, tab);
        if (ws.scriptPaneId === userPaneId) {
          activateTab(ws.id, tab.id);
          requestLeafFocus(tab.id);
        } else if (userLeaf) {
          requestLeafFocus(userLeaf);
        }
      } else if (placement === "active-pane") {
        openTab(ws.id, userPaneId, tab);
        setScriptPaneId(ws.id, userPaneId);
        activateTab(ws.id, tab.id);
        requestLeafFocus(tab.id);
      } else {
        const paneId = splitPaneAndOpenTab(ws.id, userPaneId, "bottom", tab);
        setScriptPaneId(ws.id, paneId);
        focusPane(ws.id, userPaneId);
        if (userLeaf) requestLeafFocus(userLeaf);
      }
    },
    [activateTab, focusPane, openTab, setScriptPaneId, splitPaneAndOpenTab],
  );

  const runAction = useCallback(
    (action: Action, overlay?: RunOverlay) => {
      const ws = activeWorkspace;
      if (!ws) return;
      const plan = planActionRun(action, contextFor(action, ws, deps, overlay));
      switch (plan.kind) {
        case "blocked":
          if (!plan.silent) toast.error(plan.reason, { duration: 4000 });
          return;
        case "spawn-app":
          void native
            .actionSpawn(plan.argv, overlay?.spawnCwd ?? ws.workspaceRoot ?? ws.cwd ?? undefined)
            .catch((e: unknown) => {
              const why = e instanceof Error ? e.message : String(e);
              toast.error(`${action.name.trim() || "Action"} not run: ${why}`, { duration: 6000 });
            });
          return;
        case "already-running":
          revealActionTab(plan.tabId);
          flashTab(plan.tabId);
          return;
        case "reuse-tab":
          revealActionTab(plan.tabId);
          setScriptRunning(plan.tabId, "running");
          setScriptCommand(plan.tabId, action.command);
          scheduleWrite(plan.tabId, plan.input, WRITE_DELAY_REUSED_MS);
          return;
        case "new-tab": {
          const tabId = newTabId();
          const tab: Tab = { id: tabId, kind: "terminal", cwd: plan.cwd, title: plan.title };
          if (plan.cwd) {
            void native
              .fsStat(plan.cwd)
              .catch(() => null)
              .then((stat) => {
                const msg = scriptFolderMissingMessage(plan.cwd as string, stat);
                if (msg) toast.error(msg.replace("Script not run", `${plan.title} not run`), { duration: 6000 });
              });
          }
          openScriptTab(ws, tab, plan.placement);
          linkActionTab(action.id, tabId);
          setScriptRunning(tabId, "running");
          setScriptCommand(tabId, action.command);
          scheduleWrite(tabId, plan.input, WRITE_DELAY_NEW_MS);
          return;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeWorkspace, openScriptTab, revealActionTab, scheduleWrite, deps.focusFolder, findTabGlobal],
  );

  const stopAction = useCallback(
    (action: Action) => {
      const tabId = getActionTab(action.id);
      const mark = tabId ? getScriptRunningSnapshot().get(tabId) : undefined;
      const plan = planActionStop(
        tabId
          ? {
              tabId,
              exists: !!findTabGlobal(tabId),
              mark,
              commandSeen: scriptCommandSeen.current.has(tabId),
            }
          : null,
      );
      if (plan.kind === "none") return;
      revealActionTab(plan.tabId);
      setScriptRunning(plan.tabId, plan.mark);
      if (plan.stage === "type") {
        terminalHandles.current.get(plan.tabId)?.write("\x03");
        return;
      }
      // Windows keeps Ctrl+C: its processes are not pid-addressable this way.
      if (IS_WINDOWS) return;
      void native
        .ptyStop(plan.tabId)
        .catch((e: unknown) => console.warn(`pty_stop tab=${plan.tabId} failed`, e));
    },
    [findTabGlobal, revealActionTab, scriptCommandSeen, terminalHandles],
  );

  /** Click on an Action's name: bring its tab into view without running anything. */
  const focusActionTab = useCallback(
    (action: Action): boolean => {
      const tabId = getActionTab(action.id);
      return tabId ? revealActionTab(tabId, true) : false;
    },
    [revealActionTab],
  );

  /** F12: run the active Action, or stop it when it is already running. */
  const toggleActiveAction = useCallback(() => {
    const ws = activeWorkspace;
    if (!ws) return;
    const action = pickRunnableAction(ws.actions ?? [], ws.activeAction);
    if (!action) return;
    const tabId = action.runInTerminal ? getActionTab(action.id) : undefined;
    if (tabId && getScriptRunningSnapshot().get(tabId)) stopAction(action);
    else runAction(action);
  }, [activeWorkspace, runAction, stopAction]);

  return { runAction, stopAction, focusActionTab, toggleActiveAction };
}

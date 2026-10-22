import { useEffect, useRef } from "react";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import {
  ACTIONS_ATTACH_EVENT,
  ACTIONS_DETACH_EVENT,
  ACTIONS_EDIT_EVENT,
  ACTIONS_PUSH_EVENT,
  pushKey,
  type ActionsEdit,
  type ActionsPush,
} from "./actionsLink";
import { useActionContext, type ActionContext } from "./useActionContext";
import { focusedTab } from "@/modules/workspaces/lib/splitNode";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { useWorkspaceTitle } from "@/modules/workspaces/lib/workspaceTitle";
import type { Action } from "./types";

export type WorkspaceActionsMutators = {
  add: (workspaceId: string, action: Action) => void;
  update: (workspaceId: string, id: string, action: Action) => void;
  remove: (workspaceId: string, id: string) => void;
  reorder: (workspaceId: string, fromId: string, toId: string) => void;
  toGlobal: (workspaceId: string, id: string) => void;
  toWorkspace: (workspaceId: string, id: string) => void;
};

const applyEdit = (m: WorkspaceActionsMutators, edit: ActionsEdit): void => {
  switch (edit.kind) {
    case "add":
      m.add(edit.workspaceId, edit.action);
      return;
    case "update":
      m.update(edit.workspaceId, edit.id, edit.action);
      return;
    case "remove":
      m.remove(edit.workspaceId, edit.id);
      return;
    case "reorder":
      m.reorder(edit.workspaceId, edit.fromId, edit.toId);
      return;
    case "toGlobal":
      m.toGlobal(edit.workspaceId, edit.id);
      return;
    case "toWorkspace":
      m.toWorkspace(edit.workspaceId, edit.id);
      return;
  }
};

type Props = {
  /** Null only while there is no workspace at all, in which case nothing is pushed. */
  workspace:
    | Pick<Workspace, "id" | "title" | "paneTree" | "activePaneId" | "cwd" | "workspaceRoot" | "actions" | "hibernated">
    | null;
  mutators: WorkspaceActionsMutators;
};

// Broadcasting the workspace Actions to the Settings window: pushes flow only while some
// window is attached, and only when the payload's key changes. The workspace stays the
// single source of truth: what the Settings window sees of an edit is its own push back.
export function useWorkspaceActionsBroadcast({ workspace, mutators }: Props): void {
  const context = useActionContext(workspace);
  const attached = useRef(0);
  const lastKey = useRef<string | null>(null);
  const mutatorsRef = useRef(mutators);
  mutatorsRef.current = mutators;
  const contextRef = useRef<ActionContext | null>(context);
  contextRef.current = context;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  // The name the Header shows, with its {templates} expanded from the focused tab, not the raw title.
  const shownTitle = useWorkspaceTitle({
    id: workspace?.id,
    title: workspace?.title ?? "",
    cwd: workspace?.cwd,
    workspaceRoot: workspace?.workspaceRoot,
    focusedTab: workspace ? focusedTab(workspace.paneTree, workspace.activePaneId) : null,
  });
  const titleRef = useRef("Untitled");
  titleRef.current = shownTitle.trim() || "Untitled";

  const push = useRef(() => {
    const ws = workspaceRef.current;
    if (!ws || attached.current === 0) return;
    void getAllWebviewWindows().then((windows) => {
      // A destroyed window never reports detach, so the count alone cannot be trusted:
      // the Settings window must exist as long as it counts itself attached.
      if (!windows.some((w) => w.label === "settings")) {
        if (attached.current !== 0) {
          attached.current = 0;
          lastKey.current = null;
        }
        return;
      }
      const payload: ActionsPush = {
        workspaceId: ws.id,
        workspaceName: titleRef.current,
        actions: ws.actions ?? [],
        context: contextRef.current,
      };
      const key = pushKey(payload);
      if (key === lastKey.current) return;
      lastKey.current = key;
      void emit(ACTIONS_PUSH_EVENT, payload);
    });
  });
  const pushNow = useRef(push.current);
  pushNow.current = () => {
    lastKey.current = null;
    push.current();
  };

  useEffect(() => {
    const unlisten: UnlistenFn[] = [];
    void listen(ACTIONS_ATTACH_EVENT, () => {
      attached.current = 1;
      pushNow.current();
    }).then((u) => unlisten.push(u));
    void listen(ACTIONS_DETACH_EVENT, () => {
      attached.current = Math.max(0, attached.current - 1);
      lastKey.current = null;
    }).then((u) => unlisten.push(u));
    void listen<ActionsEdit>(ACTIONS_EDIT_EVENT, (e) => {
      lastKey.current = null;
      applyEdit(mutatorsRef.current, e.payload);
    }).then((u) => unlisten.push(u));
    return () => {
      for (const u of unlisten) u();
    };
  }, []);

  useEffect(() => {
    push.current();
  });
}

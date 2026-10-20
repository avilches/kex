import { useEffect, useRef } from "react";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useWorkspaceTitle } from "@/modules/workspaces/lib/workspaceTitle";
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
import type { Workspace } from "@/modules/workspaces/lib/types";
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
  const title = useWorkspaceTitle(workspace as never);
  const attached = useRef(0);
  const lastKey = useRef<string | null>(null);
  const mutatorsRef = useRef(mutators);
  mutatorsRef.current = mutators;
  const contextRef = useRef<ActionContext | null>(context);
  contextRef.current = context;

  const buildPush = (): ActionsPush | null =>
    workspace
      ? {
          workspaceId: workspace.id,
          workspaceName: title,
          actions: workspace.actions ?? [],
          context: contextRef.current,
        }
      : null;

  useEffect(() => {
    const unlisten: UnlistenFn[] = [];
    const rePush = () => lastKey.current = null;
    void emit(ACTIONS_ATTACH_EVENT).then(rePush);
    void listen(ACTIONS_ATTACH_EVENT, () => {
      attached.current += 1;
      rePush();
    }).then((u) => unlisten.push(u));
    void listen(ACTIONS_DETACH_EVENT, () => {
      attached.current = Math.max(0, attached.current - 1);
      lastKey.current = null;
    }).then((u) => unlisten.push(u));
    void listen<ActionsEdit>(ACTIONS_EDIT_EVENT, (e) => {
      rePush();
      applyEdit(mutatorsRef.current, e.payload);
    }).then((u) => unlisten.push(u));
    return () => {
      attached.current = 0;
      void emit(ACTIONS_DETACH_EVENT);
      for (const u of unlisten) u();
    };
  }, []);

  useEffect(() => {
    const push = buildPush();
    if (!push || attached.current === 0) return;
    const key = pushKey(push);
    if (key === lastKey.current) return;
    lastKey.current = key;
    void emit(ACTIONS_PUSH_EVENT, push);
  });
}

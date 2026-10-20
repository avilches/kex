import type { Action } from "./types";
import type { ActionContext } from "./useActionContext";

// The link between the workspace Actions, owned by the main window, and the Actions
// editor of the Settings window, which edits both scopes: a push carries what the editor
// shows of the workspace scope, and an edit carries one change the other way. Every
// opposite side runs the same pure operations the main window stores are built on.

/** Main window -> Settings while the Settings window is attached. */
export type ActionsPush = {
  workspaceId: string;
  workspaceName: string;
  actions: readonly Action[];
  context: ActionContext | null;
};

/** Settings -> main window: one change against the workspace or the global list. */
export type ActionsEdit =
  | { kind: "add"; workspaceId: string; action: Action }
  | { kind: "update"; workspaceId: string; id: string; action: Action }
  | { kind: "remove"; workspaceId: string; id: string }
  | { kind: "reorder"; workspaceId: string; fromId: string; toId: string }
  /** Moves a workspace Action into the global list. */
  | { kind: "toGlobal"; workspaceId: string; id: string }
  /** Moves a global Action into this workspace. */
  | { kind: "toWorkspace"; workspaceId: string; id: string };

export const ACTIONS_ATTACH_EVENT = "kex:actions-attach";
export const ACTIONS_DETACH_EVENT = "kex:actions-detach";
export const ACTIONS_PUSH_EVENT = "kex:actions-push";
export const ACTIONS_EDIT_EVENT = "kex:actions-edit";

/** The serialized push payload only changes when its content does, so a push is never sent twice. */
export const pushKey = (push: ActionsPush): string =>
  JSON.stringify([push.workspaceId, push.workspaceName, push.actions, push.context]);

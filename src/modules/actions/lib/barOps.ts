import { removeAction, reorderActions, updateAction } from "./actions";
import type { Action } from "./types";
import type { BarController } from "./useActionsBar";

export type BarOps = Pick<BarController, "reorder" | "update" | "remove" | "move">;

type GlobalStore = {
  get: () => Action[];
  change: (fn: (list: Action[]) => Action[]) => Promise<{ before: Action[]; after: Action[] }>;
};

type Deps = {
  workspaceId: () => string | undefined;
  updateWorkspaceAction: (workspaceId: string, id: string, patch: Partial<Omit<Action, "id">>) => void;
  removeWorkspaceAction: (workspaceId: string, id: string) => void;
  reorderWorkspaceActions: (workspaceId: string, fromId: string, toId: string) => void;
  promoteWorkspaceAction: (workspaceId: string, id: string) => void;
  demoteGlobalAction: (workspaceId: string, id: string) => void;
  global: GlobalStore;
  unlink: (before: readonly Action[], after: readonly Action[]) => void;
  fail: (message: string, err: unknown) => void;
};

// What the Header does to an Action it draws: the workspace scope goes through the
// workspace store, the global one through the serialized global store.
export function createBarOps(d: Deps): BarOps {
  const global = (fn: (list: Action[]) => Action[], message: string, afterWrite?: (b: Action[], a: Action[]) => void) => {
    d.global
      .change(fn)
      .then(({ before, after }) => afterWrite?.(before, after))
      .catch((err: unknown) => d.fail(message, err));
  };

  const update: BarOps["update"] = (scope, id, patch) => {
    if (scope === "global") return global((list) => updateAction(list, id, patch), "Could not save the actions");
    const ws = d.workspaceId();
    if (ws) d.updateWorkspaceAction(ws, id, patch);
  };

  return {
    update,
    reorder: (scope, fromId, toId) => {
      if (scope === "global") return global((list) => reorderActions(list, fromId, toId), "Could not save the actions");
      const ws = d.workspaceId();
      if (ws) d.reorderWorkspaceActions(ws, fromId, toId);
    },
    remove: (scope, id) => {
      if (scope === "global") {
        return global((list) => removeAction(list, id), "Could not delete the action", d.unlink);
      }
      const ws = d.workspaceId();
      if (ws) d.removeWorkspaceAction(ws, id);
    },
    move: (scope, id) => {
      const ws = d.workspaceId();
      if (!ws) return;
      if (scope === "workspace") d.promoteWorkspaceAction(ws, id);
      else d.demoteGlobalAction(ws, id);
    },
  };
}

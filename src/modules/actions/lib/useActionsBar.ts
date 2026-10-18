import { useMemo } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { buildActionsBarModel, ownButtonsThatFit, type BarModel } from "./actionsBar";
import type { Action } from "./types";
import { useActionContext } from "./useActionContext";
import { useActionStates } from "./useActionStates";

export type BarController = {
  run: (action: Action) => void;
  stop: (action: Action) => void;
  /** Brings the tab of a running script into view; false when it has none. */
  focus: (action: Action) => boolean;
};

type Input = {
  workspace: Pick<Workspace, "paneTree" | "activePaneId" | "cwd" | "workspaceRoot" | "actions" | "activeAction" | "hibernated"> | null;
  /** Pixels the bar has; absent until measured, which shows every own button. */
  room?: number;
};

const NONE: readonly Action[] = [];

// The workspace's Actions come first, then the global ones, each in the user's own order.
export function useActionsBarModel({ workspace, room }: Input): BarModel {
  const global = usePreferencesStore((s) => s.actions) ?? NONE;
  const context = useActionContext(workspace);
  const states = useActionStates();
  const local = workspace?.actions ?? NONE;
  const actions = useMemo(() => [...local, ...global], [local, global]);
  const ownButtonsShown = useMemo(
    () => (room === undefined ? undefined : ownButtonsThatFit(actions.filter((a) => a.ownButton), room)),
    [actions, room],
  );
  return useMemo(
    () => buildActionsBarModel({ actions, context, states, activeId: workspace?.activeAction, ownButtonsShown }),
    [actions, context, states, workspace?.activeAction, ownButtonsShown],
  );
}

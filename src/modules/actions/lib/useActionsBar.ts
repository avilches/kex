import { useMemo } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { appsFirst, buildActionsBarModel, ownButtonCandidates, ownButtonsThatFit, type BarModel } from "./actionsBar";
import type { Action } from "./types";
import { useActionContext } from "./useActionContext";
import { useActionStates } from "./useActionStates";

export type BarController = {
  run: (action: Action) => void;
  stop: (action: Action) => void;
  /** Brings the tab of a running script into view; false when it has none. */
  focus: (action: Action) => boolean;
  /** Moves an Action of the given scope to the place of another one of the same scope. */
  reorder: (scope: "workspace" | "global", fromId: string, toId: string) => void;
};

type Input = {
  workspace: Pick<Workspace, "paneTree" | "activePaneId" | "cwd" | "workspaceRoot" | "actions" | "activeAction" | "hibernated"> | null;
  /** Pixels the bar has; absent until measured, which shows every own button. */
  room?: number;
};

const NONE: readonly Action[] = [];

export function useActionsBarModel({ workspace, room }: Input): BarModel {
  const global = usePreferencesStore((s) => s.actions) ?? NONE;
  const context = useActionContext(workspace);
  const states = useActionStates();
  const local = workspace?.actions ?? NONE;
  const ownButtonsShown = useMemo(
    () =>
      room === undefined
        ? undefined
        : ownButtonsThatFit(ownButtonCandidates(appsFirst(local), appsFirst(global), states, context?.place), room, context?.place, states),
    [local, global, room, context, states],
  );
  return useMemo(
    () =>
      buildActionsBarModel({
        local,
        global,
        context,
        states,
        activeId: workspace?.activeAction,
        ownButtonsShown,
        place: context?.place,
      }),
    [local, global, context, states, workspace?.activeAction, ownButtonsShown],
  );
}

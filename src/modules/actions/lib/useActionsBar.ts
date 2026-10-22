import { useMemo } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { appsFirst, buildActionsBarModel, ownButtonCandidates, ownButtonsThatFit, type BarModel } from "./actionsBar";
import type { Action } from "./types";
import { useActionContext } from "./useActionContext";
import { useActionStates } from "./useActionStates";

export type BarScope = "workspace" | "global";

export type BarController = {
  run: (action: Action) => void;
  stop: (action: Action) => void;
  /** Brings the tab of a running script into view; false when it has none. */
  focus: (action: Action) => boolean;
  /** Moves an Action of the given scope to the place of another one of the same scope. */
  reorder: (scope: BarScope, fromId: string, toId: string) => void;
  /** Puts an Action of the given scope right before `beforeId`, or last. */
  place: (scope: BarScope, id: string, beforeId?: string) => void;
  /** Merges a patch into an Action of the given scope. */
  update: (scope: BarScope, id: string, patch: Partial<Omit<Action, "id">>) => void;
  remove: (scope: BarScope, id: string) => void;
  /** Opens the card of an Action in Settings. */
  edit: (scope: BarScope, id: string) => void;
  /** Moves an Action to the other scope, before `beforeId` there or last. */
  move: (scope: BarScope, id: string, beforeId?: string) => void;
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

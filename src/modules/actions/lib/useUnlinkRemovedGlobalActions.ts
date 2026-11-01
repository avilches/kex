import { useEffect, useRef } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { unlinkRemovedActions } from "./actionStateStore";
import type { Action } from "./types";

/** Forgets where a global Action ran once it leaves the list. The links and the running marks live in
 * this window, while the list is edited in Settings and comes back as a change of the preferences, so
 * this compares what came back. An id that a workspace holds now (an Action moved there keeps its id)
 * is not removed, only moved. */
export function unlinkGlobalActionsLeft(
  before: readonly Action[],
  after: readonly Action[],
  workspaces: readonly Pick<Workspace, "actions">[],
): void {
  const kept = workspaces.flatMap((w) => w.actions ?? []);
  unlinkRemovedActions(before, [...after, ...kept]);
}

export function useUnlinkRemovedGlobalActions(workspacesRef: { readonly current: readonly Pick<Workspace, "actions">[] }): void {
  const previous = useRef<Action[]>(usePreferencesStore.getState().actions);
  useEffect(
    () =>
      usePreferencesStore.subscribe((state) => {
        const before = previous.current;
        previous.current = state.actions;
        if (before !== state.actions) unlinkGlobalActionsLeft(before, state.actions, workspacesRef.current);
      }),
    [workspacesRef],
  );
}

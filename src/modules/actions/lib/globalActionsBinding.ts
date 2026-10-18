import { newActionId } from "@/lib/ids";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setGlobalActions } from "@/modules/settings/store";
import { createGlobalActions } from "./globalActions";

export const globalActions = createGlobalActions({
  read: () => usePreferencesStore.getState().actions,
  write: setGlobalActions,
  makeId: newActionId,
});

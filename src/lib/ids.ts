function nid(bytes = 6): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export const newWorkspaceId = () => `ws-${nid()}`;
export const newPaneId      = () => `pane-${nid()}`;
export const newSplitId     = () => `sp-${nid()}`;
export const newTabId       = () => `tab-${nid()}`;
export const newThemeId     = () => `th-${nid()}`;
export const newActionId    = () => `ac-${nid()}`;
export const newGroupId     = () => `grp-${nid()}`;

function nid(bytes = 6): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export const newWorkspaceId = () => `ws-${nid()}`;
export const newPaneId      = () => `grp-${nid()}`;
export const newSplitId     = () => `sp-${nid()}`;
export const newPanelId     = () => `tab-${nid()}`;
export const newThemeId     = () => `th-${nid()}`;
export const newScriptId    = () => `sc-${nid()}`;
export const newEditorId    = () => `ed-${nid()}`;
export const newStatusId    = () => `st-${nid()}`;

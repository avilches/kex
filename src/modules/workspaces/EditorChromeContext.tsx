import { createContext, useContext } from "react";

export type EditorChrome = {
  /** Root the editor path bar shows paths relative to (active workspace). */
  explorerRoot: string | null;
  /** Pinned workspace root, used to mark the root segment in the path bar. */
  workspaceRoot: string | null;
  home: string | null;
  /** Git repo root resolved from explorerRoot; null when outside a repo. */
  gitRootPath: string | null;
};

const EditorChromeContext = createContext<EditorChrome>({
  explorerRoot: null,
  workspaceRoot: null,
  home: null,
  gitRootPath: null,
});

export const EditorChromeProvider = EditorChromeContext.Provider;

export function useEditorChrome(): EditorChrome {
  return useContext(EditorChromeContext);
}

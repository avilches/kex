import { createContext, useContext } from "react";

export type EditorChrome = {
  /** Root the editor path bar shows paths relative to (active workspace). */
  explorerRoot: string | null;
  home: string | null;
};

const EditorChromeContext = createContext<EditorChrome>({
  explorerRoot: null,
  home: null,
});

export const EditorChromeProvider = EditorChromeContext.Provider;

export function useEditorChrome(): EditorChrome {
  return useContext(EditorChromeContext);
}

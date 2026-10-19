import { EDITOR_PREVIEW_SAMPLE } from "@/modules/theme/editorThemePreview";
import { CM_THEME_PREVIEW_SETUP } from "@/lib/codemirrorSetup";
import { EDITOR_THEME_EXT } from "@/modules/editor/lib/themes";
import type { EditorThemeId } from "@/modules/settings/store";
import { javascript } from "@codemirror/lang-javascript";
import type { EditorSurface } from "@/modules/theme/types";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { useMemo } from "react";

// The preview is never focused, but themes style the selection under .cm-focused.
const BASE = [javascript({ typescript: true }), EditorView.editorAttributes.of({ class: "cm-focused" })];
const SELECTED = 'debounce.name';
const SELECTION = (() => {
  const from = EDITOR_PREVIEW_SAMPLE.indexOf(SELECTED);
  return { anchor: from, head: from + SELECTED.length };
})();

export default function EditorThemePreview({
  themeId,
  surface,
}: {
  themeId: EditorThemeId;
  surface?: EditorSurface;
}) {
  const extensions = useMemo(
    () =>
      surface
        ? [
            ...BASE,
            EditorView.theme({
              "&": {
                backgroundColor: `${surface.background ?? "transparent"} !important`,
                ...(surface.foreground ? { color: surface.foreground } : {}),
              },
            }),
          ]
        : BASE,
    [surface],
  );
  return (
    <div className="overflow-hidden rounded-md border border-border/60 text-[11.5px]">
      <CodeMirror
        value={EDITOR_PREVIEW_SAMPLE}
        theme={EDITOR_THEME_EXT[themeId]}
        extensions={extensions}
        readOnly
        selection={SELECTION}
        editable={false}
        basicSetup={CM_THEME_PREVIEW_SETUP}
      />
    </div>
  );
}

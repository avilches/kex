import { EDITOR_PREVIEW_SAMPLE } from "@/modules/theme/editorThemePreview";
import { EDITOR_THEME_EXT } from "@/modules/editor/lib/themes";
import type { EditorThemeId } from "@/modules/settings/store";
import { javascript } from "@codemirror/lang-javascript";
import CodeMirror from "@uiw/react-codemirror";

const EXTENSIONS = [javascript({ typescript: true })];

export default function EditorThemePreview({ themeId }: { themeId: EditorThemeId }) {
  return (
    <div className="overflow-hidden rounded-md border border-border/60 text-[11.5px]">
      <CodeMirror
        value={EDITOR_PREVIEW_SAMPLE}
        theme={EDITOR_THEME_EXT[themeId]}
        extensions={EXTENSIONS}
        readOnly
        editable={false}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
        }}
      />
    </div>
  );
}

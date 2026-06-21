import { useEffect } from "react";
import { resolveMonoFontFamily } from "@/lib/fonts";
import { usePreferencesStore } from "@/modules/settings/preferences";

const FAMILY_VAR = "--editor-font-family";
const SIZE_VAR = "--editor-font-size";
const LETTER_SPACING_VAR = "--editor-letter-spacing";
const LINE_HEIGHT_VAR = "--editor-line-height";

// CodeMirror's font is driven by these CSS variables (see editor/lib/extensions.ts)
// so changing them re-renders every mounted editor without rebuilding its state.
export function useEditorFont(): void {
  const fontFamily = usePreferencesStore((s) => s.editorFontFamily);
  const fontSize = usePreferencesStore((s) => s.editorFontSize);
  const letterSpacing = usePreferencesStore((s) => s.editorLetterSpacing);
  const lineHeight = usePreferencesStore((s) => s.editorLineHeight);
  const hydrated = usePreferencesStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement.style;
    root.setProperty(FAMILY_VAR, resolveMonoFontFamily(fontFamily));
    root.setProperty(SIZE_VAR, `${fontSize}px`);
    root.setProperty(LETTER_SPACING_VAR, `${letterSpacing}px`);
    root.setProperty(LINE_HEIGHT_VAR, String(lineHeight));
  }, [hydrated, fontFamily, fontSize, letterSpacing, lineHeight]);
}

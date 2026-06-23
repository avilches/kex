import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { CursorStyle } from "@/modules/settings/store";

// CodeMirror's default caret blinks (~1.2s). Disable it by killing the
// animation on the cursor layer; enabling just restores the default.
export function cursorBlinkExt(blink: boolean): Extension {
  if (blink) return [];
  return EditorView.theme({
    ".cm-cursorLayer": { animation: "none !important" },
  });
}

// The editor is monospace, so a fixed 1ch width aligns the block/underline
// caret with the glyph cell. Translucent fill keeps the character readable.
export function cursorStyleExt(style: CursorStyle): Extension {
  if (style === "bar") return [];
  if (style === "block") {
    return EditorView.theme({
      ".cm-cursor.cm-cursor-primary": {
        width: "1ch",
        borderLeft: "none",
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 35%, transparent)",
        outline:
          "1px solid color-mix(in srgb, var(--foreground) 55%, transparent)",
      },
    });
  }
  return EditorView.theme({
    ".cm-cursor.cm-cursor-primary": {
      width: "1ch",
      borderLeft: "none",
      borderBottom: "2px solid var(--foreground)",
    },
  });
}

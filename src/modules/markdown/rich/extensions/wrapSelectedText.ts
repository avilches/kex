import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

// Shared source of truth for editor behaviors that wrap an active selection.
// Keep this small: only characters users reasonably expect to form pairs.
const selectionPairs: Record<string, string> = {
  "(": ")",
  "{": "}",
  "[": "]",
  "'": "'",
  '"': '"',
  "`": "`",
};

// Returns the closing character for a typed wrapper key, or null to pass through.
export function getSelectionPair(key: string) {
  return selectionPairs[key] ?? null;
}

// TipTap/ProseMirror behavior for wrapping a non-empty rich-editor selection
// without flattening selected inline marks or content to plain text.
export const WrapSelectedText = Extension.create({
  name: "wrapSelectedText",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("wrapSelectedText"),
        props: {
          // Intercept only supported single-character text input over a range.
          // Everything else falls back to ProseMirror's normal input handling.
          handleTextInput(view, from, to, text) {
            const close = getSelectionPair(text);
            if (!close || from === to) return false;

            const tr = view.state.tr.insertText(close, to).insertText(text, from);
            tr.setSelection(TextSelection.create(tr.doc, from + text.length, to + text.length));
            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});

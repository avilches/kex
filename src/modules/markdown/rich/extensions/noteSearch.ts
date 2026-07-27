import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const noteSearchPluginKey = new PluginKey("noteSearch");

// Holds a DecorationSet swapped via tr.setMeta(noteSearchPluginKey, decorations); remapped on doc changes.
export const NoteSearchExtension = Extension.create({
  name: "noteSearch",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: noteSearchPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, old) {
            const meta = tr.getMeta(noteSearchPluginKey);
            if (meta !== undefined) return meta;
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

export type SearchMatch = { from: number; to: number };

export function findMatches(doc: PMNode, query: string): SearchMatch[] {
  if (!query) return [];
  const results: SearchMatch[] = [];
  const lowerQuery = query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text.toLowerCase();
    let idx = text.indexOf(lowerQuery);
    while (idx !== -1) {
      results.push({ from: pos + idx, to: pos + idx + query.length });
      idx = text.indexOf(lowerQuery, idx + 1);
    }
  });
  return results;
}

export function applySearchDecorations(editor: Editor, matches: SearchMatch[], currentIndex: number): void {
  const decorations = matches.map((m, i) =>
    Decoration.inline(m.from, m.to, { class: i === currentIndex ? "note-search-match current" : "note-search-match" }),
  );
  const decoSet = DecorationSet.create(editor.state.doc, decorations);
  const tr = editor.state.tr.setMeta(noteSearchPluginKey, decoSet);
  editor.view.dispatch(tr);
}

import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, type PluginKey } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";

// Remap decorations while typing; full rebuild 300ms after it settles, so large notes don't rescan the whole doc per keystroke.
export function lazyDecorationPlugin(key: PluginKey, build: (doc: PMNode) => DecorationSet): Plugin {
  return new Plugin({
    key,
    state: {
      init: (_config, state) => build(state.doc),
      apply: (tr, old, _oldState, newState) => {
        if (tr.getMeta(key) === "rebuildDecos") return build(newState.doc);
        if (!tr.docChanged) return old;
        return old.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return key.getState(state);
      },
    },
    view() {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return {
        update(view, prev) {
          if (view.state.doc === prev.doc) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            timer = null;
            if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, "rebuildDecos"));
          }, 300);
        },
        destroy() {
          if (timer) clearTimeout(timer);
        },
      };
    },
  });
}

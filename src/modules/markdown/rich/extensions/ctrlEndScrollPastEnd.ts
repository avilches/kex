import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

function scrollEditorBodyToBottom(source: HTMLElement | null | undefined) {
  const editorBody = source?.closest(".rich-md-body") as HTMLElement | null;
  if (!editorBody) return;
  editorBody.scrollTop = editorBody.scrollHeight;
  requestAnimationFrame(() => {
    editorBody.scrollTop = editorBody.scrollHeight;
  });
}

export const CtrlEndScrollPastEnd = Extension.create({
  name: "ctrlEndScrollPastEnd",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("ctrlEndScrollPastEnd"),
        props: {
          handleDOMEvents: {
            keydown(view, event) {
              if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.key !== "End") return false;
              event.preventDefault();
              const tr = view.state.tr.setSelection(TextSelection.atEnd(view.state.doc));
              view.dispatch(tr);
              (view.dom as HTMLElement).focus({ preventScroll: true });
              scrollEditorBodyToBottom(view.dom as HTMLElement);
              return true;
            },
          },
        },
      }),
    ];
  },
});

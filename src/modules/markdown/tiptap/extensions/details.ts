import { type Editor, Extension } from "@tiptap/core";
// Type-only: pulls in the setDetails/unsetDetails command augmentations (no runtime code).
import type {} from "@tiptap/extension-details";
import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";

function openDetailsEl(el: HTMLElement): void {
  if (!el.classList.contains("is-open")) {
    el.classList.add("is-open");
    el.querySelector('[data-type="detailsContent"]')?.dispatchEvent(
      new Event("toggleDetailsContent"),
    );
  }
}

export const CollapsibleKeymap = Extension.create({
  name: "collapsibleKeymap",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("collapsibleKeymap"),
        props: {
          handleDOMEvents: {
            keydown(view, event) {
              const isTab =
                event.key === "Tab" &&
                !event.shiftKey &&
                !event.altKey &&
                !event.ctrlKey &&
                !event.metaKey;
              const isEnter =
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.altKey &&
                !event.ctrlKey &&
                !event.metaKey;
              if (!isTab && !isEnter) return false;
              const { schema, selection } = view.state;
              const from = selection.$from;
              let summaryDepth = -1;
              for (let d = from.depth; d >= 0; d--) {
                if (from.node(d).type === schema.nodes.detailsSummary) {
                  summaryDepth = d;
                  break;
                }
              }
              if (summaryDepth === -1) return false;
              event.preventDefault();
              const detailsDepth = summaryDepth - 1;
              const detailsNode = from.node(detailsDepth);
              let detailsContentPos: number | null = null;
              let pos = from.start(detailsDepth);
              for (let i = 0; i < detailsNode.childCount; i++) {
                const child = detailsNode.child(i);
                if (child.type === schema.nodes.detailsContent) {
                  detailsContentPos = pos + 1;
                  break;
                }
                pos += child.nodeSize;
              }
              if (detailsContentPos === null) return true;
              // Open the section if it is closed
              const domPos = view.domAtPos(from.pos);
              let domNode = domPos.node as HTMLElement;
              if (domNode.nodeType === 3)
                domNode = domNode.parentElement as HTMLElement;
              const detailsEl = domNode?.closest(
                '[data-type="details"]',
              ) as HTMLElement | null;
              if (detailsEl) openDetailsEl(detailsEl);
              // Sync open state into document + move cursor (single transaction)
              const detailsPos = from.before(detailsDepth);
              const tr = view.state.tr.setNodeMarkup(detailsPos, undefined, {
                open: true,
              });
              const mappedContentPos = tr.mapping.map(detailsContentPos);
              tr.setSelection(
                Selection.near(tr.doc.resolve(mappedContentPos), 1),
              );
              view.dispatch(tr.scrollIntoView());
              view.focus();
              return true;
            },
          },
        },
      }),
    ];
  },
});

export const DetailsOpenAttrSync = Extension.create({
  name: "detailsOpenAttrSync",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("detailsOpenAttrSync"),
        props: {
          handleDOMEvents: {
            click(view, event) {
              const btn = (event.target as HTMLElement)?.closest?.("button");
              const detailsEl =
                btn &&
                btn.parentElement?.getAttribute("data-type") === "details"
                  ? (btn.parentElement as HTMLElement)
                  : null;
              if (!detailsEl) return false;
              // The extension's button handler already toggled the is-open class; sync
              // node.attrs.open to it. Fixes the first node (pos 0), where upstream's
              // `if (!pos)` guard skips persisting the attribute.
              const isOpen = detailsEl.classList.contains("is-open");
              const probe =
                detailsEl.querySelector('[data-type="detailsContent"]') ??
                detailsEl;
              let pos: number;
              try {
                pos = view.posAtDOM(probe, 0);
              } catch {
                return false;
              }
              const resolved = view.state.doc.resolve(pos);
              for (let d = resolved.depth; d >= 0; d--) {
                if (resolved.node(d).type.name === "details") {
                  if (resolved.node(d).attrs.open !== isOpen) {
                    view.dispatch(
                      view.state.tr.setNodeMarkup(
                        resolved.before(d),
                        undefined,
                        { open: isOpen },
                      ),
                    );
                  }
                  break;
                }
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});

export function insertDetails(editor: Editor): void {
  editor.chain().focus().setDetails().run();
  requestAnimationFrame(() => {
    const domPos = editor.view.domAtPos(editor.state.selection.from);
    let node = domPos.node as HTMLElement;
    if (node.nodeType === 3) node = node.parentElement as HTMLElement;
    const detailsEl = node.closest(
      '[data-type="details"]',
    ) as HTMLElement | null;
    if (detailsEl) openDetailsEl(detailsEl);
    // Sync open: true into the document so it saves with the note
    editor.chain().updateAttributes("details", { open: true }).run();
  });
}

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";

export const MoveLineShortcuts = Extension.create({
  name: "moveLineShortcuts",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("moveLineShortcuts"),
        props: {
          handleDOMEvents: {
            keydown(view, event) {
              if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return false;
              event.preventDefault();
              const { state, dispatch } = view;
              const resolvedPos = state.selection.$from;
              if (event.shiftKey) {
                for (let depth = resolvedPos.depth; depth > 0; depth--) {
                  const itemNode = resolvedPos.node(depth);
                  if (itemNode.type.name !== "listItem" && itemNode.type.name !== "taskItem") continue;
                  const parentListDepth = depth - 1;
                  const itemIndex = resolvedPos.index(parentListDepth);
                  const itemPos = resolvedPos.before(depth);
                  const itemSlice = state.doc.slice(itemPos, itemPos + itemNode.nodeSize);
                  const cursorOffset = resolvedPos.pos - itemPos;
                  const tr = state.tr;

                  if (event.key === "ArrowUp") {
                    if (itemIndex <= 0) return true;
                    const prevPos = resolvedPos.posAtIndex(itemIndex - 1, parentListDepth);
                    tr.delete(itemPos, itemPos + itemNode.nodeSize);
                    const insertAt = tr.mapping.map(prevPos);
                    tr.insert(insertAt, itemSlice.content);
                    const newCursorPos = Math.min(insertAt + cursorOffset, tr.doc.content.size);
                    tr.setSelection(Selection.near(tr.doc.resolve(newCursorPos)));
                    dispatch(tr.scrollIntoView());
                    return true;
                  }

                  const parentList = resolvedPos.node(parentListDepth);
                  if (itemIndex >= parentList.childCount - 1) return true;
                  const nextPos = resolvedPos.posAtIndex(itemIndex + 1, parentListDepth);
                  const nextNode = state.doc.nodeAt(nextPos);
                  if (!nextNode) return true;
                  const nextSlice = state.doc.slice(nextPos, nextPos + nextNode.nodeSize);
                  tr.delete(nextPos, nextPos + nextNode.nodeSize);
                  const insertAt = tr.mapping.map(itemPos);
                  tr.insert(insertAt, nextSlice.content);
                  const newCursorPos = Math.min(tr.mapping.map(itemPos) + cursorOffset, tr.doc.content.size);
                  tr.setSelection(Selection.near(tr.doc.resolve(newCursorPos)));
                  dispatch(tr.scrollIntoView());
                  return true;
                }
                return true;
              }
              // Find the top-level block index
              const depth = 1; // top-level blocks in doc
              if (resolvedPos.depth < depth) return true;
              const parentPos = resolvedPos.before(depth);
              const parentNode = state.doc.nodeAt(parentPos);
              if (!parentNode) return true;
              const parentIndex = resolvedPos.index(0);
              if (event.key === "ArrowUp") {
                if (parentIndex <= 0) return true;
                const prevPos = resolvedPos.posAtIndex(parentIndex - 1, 0);
                const prevNode = state.doc.nodeAt(prevPos);
                if (!prevNode) return true;
                const tr = state.tr;
                const cursorOffset = resolvedPos.pos - parentPos;
                // Delete current block, insert it before previous block
                const curSlice = state.doc.slice(parentPos, parentPos + parentNode.nodeSize);
                tr.delete(parentPos, parentPos + parentNode.nodeSize);
                const insertAt = tr.mapping.map(prevPos);
                tr.insert(insertAt, curSlice.content);
                const newCursorPos = Math.min(insertAt + cursorOffset, tr.doc.content.size);
                tr.setSelection(Selection.near(tr.doc.resolve(newCursorPos)));
                dispatch(tr.scrollIntoView());
              } else {
                if (parentIndex >= state.doc.childCount - 1) return true;
                const nextPos = resolvedPos.posAtIndex(parentIndex + 1, 0);
                const nextNode = state.doc.nodeAt(nextPos);
                if (!nextNode) return true;
                const tr = state.tr;
                const cursorOffset = resolvedPos.pos - parentPos;
                // Delete next block, insert it before current block
                const nextSlice = state.doc.slice(nextPos, nextPos + nextNode.nodeSize);
                tr.delete(nextPos, nextPos + nextNode.nodeSize);
                const insertAt = tr.mapping.map(parentPos);
                tr.insert(insertAt, nextSlice.content);
                const newCursorPos = Math.min(tr.mapping.map(parentPos) + cursorOffset, tr.doc.content.size);
                tr.setSelection(Selection.near(tr.doc.resolve(newCursorPos)));
                dispatch(tr.scrollIntoView());
              }
              return true;
            },
          },
        },
      }),
    ];
  },
});

import { Extension } from "@tiptap/core";

// Tab inserts a tab character in plain paragraphs/headings.
// Priority 50 < default 100, so list/task/table/codeblock extensions handle Tab first for their own nodes.
export const TabIndent = Extension.create({
  name: "tabIndent",
  priority: 50,
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const sel = this.editor.state.selection;
        const from = sel.$from;
        const node = from.node();
        if (node.type.name !== "paragraph" && node.type.name !== "heading") return false;
        // Don't intercept if inside a list or task item (their extensions handle Tab first,
        // but guard here too in case of priority edge cases)
        for (let d = from.depth - 1; d > 0; d--) {
          const name = from.node(d).type.name;
          if (name === "listItem" || name === "taskItem") return false;
        }
        return this.editor.commands.insertContent("\t");
      },
    };
  },
});

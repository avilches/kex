import { Node } from "@tiptap/core";
import type { NodeView } from "@tiptap/pm/view";

function decodeText(raw: string | null): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// Claims the div sentinel markdownToHtml emits for a whole-line HTML comment.
// With no schema rule for it, ProseMirror drops the node and the comment vanishes
// from the file on the next save.
export const RawComment = Node.create({
  name: "rawComment",
  group: "block",
  atom: true,
  addAttributes() {
    return { text: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-html-comment]",
        getAttrs: (el: HTMLElement) => ({ text: decodeText(el.getAttribute("data-html-comment")) }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const text = HTMLAttributes.text || "";
    return ["div", { "data-html-comment": encodeURIComponent(text), class: "html-comment" }];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.classList.add("html-comment");
      dom.contentEditable = "false";
      dom.setAttribute("data-html-comment", encodeURIComponent(node.attrs.text));
      dom.textContent = `<!--${node.attrs.text}-->`;
      return { dom } satisfies NodeView;
    };
  },
});

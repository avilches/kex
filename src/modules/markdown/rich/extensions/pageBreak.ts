import { Node } from "@tiptap/core";

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  parseHTML() {
    return [
      { tag: "div[data-page-break]" },
      {
        tag: "div",
        getAttrs: (el: HTMLElement) => {
          const style = el.getAttribute("style") || "";
          return style.includes("page-break-after") ? {} : false;
        },
      },
    ];
  },
  renderHTML() {
    return ["div", { "data-page-break": "true", style: "page-break-after: always; break-after: page;", class: "page-break" }];
  },
});

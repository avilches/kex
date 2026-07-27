import { Node } from "@tiptap/core";
import type { NodeView } from "@tiptap/pm/view";
import type { MenuStore } from "@/modules/markdown/rich/lib/menuStore";

export type MathEditRequest = { pos: number; kind: "block" | "inline"; tex: string } | null;

type KatexModule = (typeof import("katex"))["default"];

let katexPromise: Promise<KatexModule | null> | null = null;
function loadKatex() {
  if (!katexPromise) {
    katexPromise = Promise.all([import("katex"), import("katex/dist/katex.min.css")])
      .then(([m]) => m.default ?? m)
      .catch((e) => {
        console.error("[katex] load failed", e);
        return null;
      });
  }
  return katexPromise;
}

export function renderKatexInto(el: HTMLElement, tex: string, displayMode: boolean): void {
  el.textContent = tex; // visible immediately, replaced when katex lands
  void loadKatex().then((katex) => {
    if (!katex || !el.isConnected) return;
    try {
      el.innerHTML = katex.renderToString(tex, { displayMode, throwOnError: true });
    } catch (e) {
      // Spec error policy: degrade to a code-styled block with an inline note, never crash.
      el.innerHTML = "";
      const code = document.createElement("code");
      code.className = "math-error";
      code.textContent = tex;
      const note = document.createElement("span");
      note.className = "math-error-note";
      note.textContent = ` KaTeX error: ${e instanceof Error ? e.message : String(e)}`;
      el.append(code, note);
    }
  });
}

export function createMathBlock(onEdit: MenuStore<MathEditRequest>): Node {
  return Node.create({
    name: "mathBlock",
    group: "block",
    atom: true,
    addAttributes() {
      return { tex: { default: "" } };
    },
    parseHTML() {
      return [
        {
          tag: "div[data-math-block]",
          getAttrs: (el: HTMLElement) => ({ tex: decodeURIComponent(el.getAttribute("data-math-block") || "") }),
        },
      ];
    },
    renderHTML({ HTMLAttributes }) {
      const tex = HTMLAttributes.tex || "";
      return ["div", { "data-math-block": encodeURIComponent(tex), class: "math-block" }];
    },
    addNodeView() {
      return ({ node, getPos }) => {
        const dom = document.createElement("div");
        dom.classList.add("math-block");
        dom.contentEditable = "false";
        dom.setAttribute("data-math-block", encodeURIComponent(node.attrs.tex));
        renderKatexInto(dom, node.attrs.tex, true);
        dom.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const pos = typeof getPos === "function" ? getPos() : null;
          if (pos !== null && pos !== undefined) onEdit.set({ pos, kind: "block", tex: node.attrs.tex });
        });
        return {
          dom,
          destroy() {},
        } satisfies NodeView;
      };
    },
  });
}

export function createMathInline(onEdit: MenuStore<MathEditRequest>): Node {
  return Node.create({
    name: "mathInline",
    group: "inline",
    inline: true,
    atom: true,
    addAttributes() {
      return { tex: { default: "" } };
    },
    parseHTML() {
      return [
        {
          tag: "span[data-math-inline]",
          getAttrs: (el: HTMLElement) => ({ tex: decodeURIComponent(el.getAttribute("data-math-inline") || "") }),
        },
      ];
    },
    renderHTML({ HTMLAttributes }) {
      const tex = HTMLAttributes.tex || "";
      return ["span", { "data-math-inline": encodeURIComponent(tex), class: "math-inline" }];
    },
    addNodeView() {
      return ({ node, getPos }) => {
        const dom = document.createElement("span");
        dom.classList.add("math-inline");
        dom.contentEditable = "false";
        dom.setAttribute("data-math-inline", encodeURIComponent(node.attrs.tex));
        renderKatexInto(dom, node.attrs.tex, false);
        dom.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const pos = typeof getPos === "function" ? getPos() : null;
          if (pos !== null && pos !== undefined) onEdit.set({ pos, kind: "inline", tex: node.attrs.tex });
        });
        return {
          dom,
          destroy() {},
        } satisfies NodeView;
      };
    },
  });
}

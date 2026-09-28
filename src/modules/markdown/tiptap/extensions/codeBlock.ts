import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { common, createLowlight } from "lowlight";
import { CHECK_ICON, COPY_ICON } from "@/modules/markdown/lib/codeCopyIcons";
import { lazyDecorationPlugin } from "@/modules/markdown/tiptap/extensions/lazyDecorationPlugin";
import type { MenuStore } from "@/modules/markdown/tiptap/lib/menuStore";

let lowlightSingleton: ReturnType<typeof createLowlight> | null = null;

export function getLowlight(): ReturnType<typeof createLowlight> {
  if (!lowlightSingleton) lowlightSingleton = createLowlight(common);
  return lowlightSingleton;
}

export function getCodeLanguages(): string[] {
  return [...getLowlight().listLanguages(), "mermaid"].sort();
}

export type CodeLangDropdownState = { pos: number; x: number; y: number; current: string } | null;

export const CopyButtonExtension = Extension.create({
  name: "codeBlockCopyButton",
  addProseMirrorPlugins() {
    function buildDecorations(doc: PMNode): DecorationSet {
      const decos: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (node.type.name === "codeBlock") {
          const btn = document.createElement("button");
          btn.className = "code-copy-btn";
          btn.title = "Copy code";
          btn.innerHTML = COPY_ICON;
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            navigator.clipboard.writeText(node.textContent).then(() => {
              btn.innerHTML = CHECK_ICON;
              btn.classList.add("copied");
              setTimeout(() => {
                btn.innerHTML = COPY_ICON;
                btn.classList.remove("copied");
              }, 1500);
            });
          });
          decos.push(Decoration.widget(pos + 1, btn, { side: -1, key: `copy-btn:${pos}` }));
        }
      });
      return DecorationSet.create(doc, decos);
    }
    const pluginKey = new PluginKey("codeBlockCopyButton");
    return [lazyDecorationPlugin(pluginKey, buildDecorations)];
  },
});

export function createCodeBlockLanguageSelect(store: MenuStore<CodeLangDropdownState>): Extension {
  return Extension.create({
    name: "codeBlockLanguageSelect",
    addGlobalAttributes() {
      return [
        {
          types: ["codeBlock"],
          attributes: {
            language: {
              renderHTML: (attributes) => {
                return { "data-language": attributes.language || "" };
              },
            },
          },
        },
      ];
    },
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("codeBlockLanguageSelect"),
          props: {
            handleDOMEvents: {
              click: (view, event) => {
                const target = event.target as HTMLElement;
                const pre = target.closest("pre");
                if (!pre) return false;
                // Check if click is in the top-right corner (language button area)
                const rect = pre.getBoundingClientRect();
                if (event.clientX < rect.right - 100 || event.clientY > rect.top + 30) return false;
                // Find the code block position
                const pos = view.posAtDOM(pre, 0);
                const resolved = view.state.doc.resolve(pos);
                let cbNode = resolved.parent;
                let cbPos = resolved.before(resolved.depth);
                if (cbNode.type.name !== "codeBlock") {
                  for (let d = resolved.depth; d >= 0; d--) {
                    if (resolved.node(d).type.name === "codeBlock") {
                      cbNode = resolved.node(d);
                      cbPos = resolved.before(d);
                      break;
                    }
                  }
                }
                if (cbNode.type.name !== "codeBlock") return false;
                event.preventDefault();
                event.stopPropagation();
                store.set({ pos: cbPos + 1, x: rect.right - 100, y: rect.top + 30, current: cbNode.attrs.language || "" });
                return true;
              },
            },
          },
        }),
      ];
    },
  });
}

import {
  CALLOUT_MENU,
  calloutGroup,
  calloutIcon,
  calloutLabel,
} from "@/modules/markdown/lib/callouts";
import { type Editor, Extension, mergeAttributes, Node } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { NodeView } from "@tiptap/pm/view";

interface CalloutAttrs {
  type: string;
  title: string;
  foldable: boolean;
  folded: boolean;
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      type: {
        default: "note",
        parseHTML: (el: HTMLElement) =>
          (el.getAttribute("data-callout") || "note").toLowerCase(),
        renderHTML: (a: Record<string, unknown>) => ({
          "data-callout": a.type,
        }),
      },
      title: {
        default: "",
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-callout-title") || "",
        renderHTML: (a: Record<string, unknown>) =>
          a.title ? { "data-callout-title": a.title } : {},
      },
      foldable: {
        default: false,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-callout-foldable") === "true",
        renderHTML: (a: Record<string, unknown>) => ({
          "data-callout-foldable": a.foldable ? "true" : "false",
        }),
      },
      folded: {
        default: false,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-callout-folded") === "true",
        renderHTML: (a: Record<string, unknown>) => ({
          "data-callout-folded": a.folded ? "true" : "false",
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "callout",
        "data-callout-group": calloutGroup(node.attrs.type),
      }),
      0,
    ];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("div");
      const apply = (n: PMNode) => {
        dom.className = "callout";
        dom.classList.toggle("is-foldable", !!n.attrs.foldable);
        dom.classList.toggle("is-folded", !!n.attrs.folded);
        dom.setAttribute("data-callout", n.attrs.type || "note");
        dom.setAttribute("data-callout-group", calloutGroup(n.attrs.type));
      };
      apply(node);

      const header = document.createElement("div");
      header.className = "callout-header";
      header.contentEditable = "false";

      const iconBtn = document.createElement("button");
      iconBtn.type = "button";
      iconBtn.className = "callout-icon";
      iconBtn.title = "Change type";
      iconBtn.innerHTML = calloutIcon(node.attrs.type);

      const titleInput = document.createElement("input");
      titleInput.className = "callout-title";
      titleInput.value = node.attrs.title || "";
      titleInput.placeholder = calloutLabel(node.attrs.type);
      titleInput.spellcheck = false;
      titleInput.readOnly = !editor.isEditable;

      const foldBtn = document.createElement("button");
      foldBtn.type = "button";
      foldBtn.className = "callout-fold";
      foldBtn.title = "Fold / unfold";
      foldBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

      const content = document.createElement("div");
      content.className = "callout-content";

      header.append(iconBtn, titleInput, foldBtn);
      dom.append(header, content);

      const updateAttr = (attrs: Partial<CalloutAttrs>) => {
        if (typeof getPos !== "function") return;
        const pos = getPos();
        if (pos == null) return;
        const cur = editor.state.doc.nodeAt(pos);
        if (!cur) return;
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, {
            ...cur.attrs,
            ...attrs,
          }),
        );
      };

      let titleDirty = false;
      const commitTitle = () => {
        if (titleDirty) {
          updateAttr({ title: titleInput.value });
          titleDirty = false;
        }
      };
      titleInput.addEventListener("input", () => {
        titleDirty = true;
      });
      titleInput.addEventListener("change", commitTitle);
      titleInput.addEventListener("blur", commitTitle);
      titleInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitTitle();
          titleInput.blur();
          editor.commands.focus();
        }
      });

      foldBtn.addEventListener("mousedown", (e) => e.preventDefault());
      foldBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const nowFolded = !dom.classList.contains("is-folded");
        if (editor.isEditable) {
          updateAttr({ folded: nowFolded, foldable: true });
        } else {
          dom.classList.toggle("is-folded", nowFolded);
          dom.classList.add("is-foldable");
        }
      });

      iconBtn.addEventListener("mousedown", (e) => e.preventDefault());
      iconBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!editor.isEditable) return;
        openCalloutTypeMenu(iconBtn, (newType) =>
          updateAttr({ type: newType }),
        );
      });

      return {
        dom,
        contentDOM: content,
        update(updated: PMNode) {
          if (updated.type.name !== "callout") return false;
          apply(updated);
          iconBtn.innerHTML = calloutIcon(updated.attrs.type);
          titleInput.placeholder = calloutLabel(updated.attrs.type);
          titleInput.readOnly = !editor.isEditable;
          if (document.activeElement !== titleInput)
            titleInput.value = updated.attrs.title || "";
          return true;
        },
        ignoreMutation(mutation) {
          if (mutation.type === "selection") return false;
          return !content.contains(mutation.target as globalThis.Node);
        },
        stopEvent(event) {
          return header.contains(event.target as globalThis.Node);
        },
      } satisfies NodeView;
    };
  },
});

export const CalloutTyping = Extension.create({
  name: "calloutTyping",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("calloutTyping"),
        props: {
          handleDOMEvents: {
            keydown(view, event) {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey
              )
                return false;
              const { state } = view;
              const { selection } = state;
              if (!selection.empty) return false;
              const head = selection.$head;
              if (head.depth !== 1 || head.parent.type.name !== "paragraph")
                return false;
              if (head.parentOffset !== head.parent.content.size) return false;
              const m = head.parent.textContent.match(
                /^>\s*\[!([\w-]+)\]([-+]?)[ \t]*(.*)$/,
              );
              if (!m) return false;
              event.preventDefault();
              const type = m[1].toLowerCase();
              const foldable = m[2] === "+" || m[2] === "-";
              const folded = m[2] === "-";
              const title = m[3];
              const start = head.before(1);
              const end = start + head.parent.nodeSize;
              const callout = state.schema.nodes.callout.create(
                { type, title, foldable, folded },
                [state.schema.nodes.paragraph.create()],
              );
              const tr = state.tr.replaceWith(start, end, callout);
              tr.setSelection(TextSelection.near(tr.doc.resolve(start + 2)));
              tr.scrollIntoView();
              view.dispatch(tr);
              return true;
            },
          },
          handlePaste(view, event) {
            const text = event.clipboardData?.getData("text/plain");
            if (!text || !/^>\s*\[!/m.test(text)) return false;
            const lines = text.split("\n");
            const idx = lines.findIndex((l) => /^>\s*\[!/.test(l));
            if (idx === -1) return false;
            const m = lines[idx].match(/^>\s*\[!([\w-]+)\]([-+]?)[ \t]*(.*)$/);
            if (!m) return false;
            const type = m[1].toLowerCase();
            const foldable = m[2] === "+" || m[2] === "-";
            const folded = m[2] === "-";
            const title = m[3];
            const bodyLines = lines
              .slice(idx + 1)
              .map((l) => l.replace(/^>\s?/, ""));
            while (
              bodyLines.length > 0 &&
              bodyLines[bodyLines.length - 1].trim() === ""
            )
              bodyLines.pop();
            const { state } = view;
            const schema = state.schema;
            const bodyContent =
              bodyLines.length > 0
                ? bodyLines.map((l) =>
                    schema.nodes.paragraph.create(
                      null,
                      l ? [schema.text(l)] : [],
                    ),
                  )
                : [schema.nodes.paragraph.create()];
            const callout = schema.nodes.callout.create(
              { type, title, foldable, folded },
              bodyContent,
            );
            const head = state.selection.$head;
            const tr = state.tr;
            let insertPos: number;
            if (head.depth >= 1 && head.parent.type.name === "paragraph") {
              insertPos = head.before(head.depth);
              tr.replaceWith(
                insertPos,
                insertPos + head.parent.nodeSize,
                callout,
              );
            } else {
              insertPos = state.selection.to;
              tr.insert(insertPos, callout);
            }
            tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 2)));
            tr.scrollIntoView();
            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});

export function insertCallout(editor: Editor, type = "note"): void {
  editor
    .chain()
    .focus()
    .wrapIn("callout", { type, title: "", foldable: false, folded: false })
    .run();
}

export function openCalloutTypeMenu(
  anchor: HTMLElement,
  onPick: (type: string) => void,
): void {
  for (const el of document.querySelectorAll(".callout-type-menu")) el.remove();
  const menu = document.createElement("div");
  menu.className = "callout-type-menu";
  const close = () => {
    menu.remove();
    document.removeEventListener("mousedown", onDoc, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", close, true);
  };
  const onDoc = (e: MouseEvent) => {
    if (!menu.contains(e.target as globalThis.Node)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  for (const item of CALLOUT_MENU) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "callout-type-option";
    btn.innerHTML = `<span class="callout-type-icon" style="color: rgb(var(--callout-${item.type}))">${calloutIcon(item.type, 16)}</span><span>${item.label}</span>`;
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      onPick(item.type);
      close();
    });
    menu.appendChild(btn);
  }
  // "Custom…" fills the last grid slot: name any callout type (Obsidian round-trips it).
  const customBtn = document.createElement("button");
  customBtn.type = "button";
  customBtn.className = "callout-type-option";
  customBtn.innerHTML =
    '<span class="callout-type-icon" style="color: var(--text-secondary)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg></span><span>Custom…</span>';
  customBtn.addEventListener("mousedown", (e) => e.preventDefault());
  customBtn.addEventListener("click", () => {
    menu.classList.add("is-custom");
    menu.innerHTML = "";
    const input = document.createElement("input");
    input.className = "callout-type-custom-input";
    input.placeholder = "Type name, then Enter";
    input.spellcheck = false;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = input.value
          .trim()
          .toLowerCase()
          .replace(/[^\w-]/g, "");
        if (v) onPick(v);
        close();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });
    menu.appendChild(input);
    input.focus();
  });
  menu.appendChild(customBtn);
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = `${Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8)}px`;
  menu.style.left = `${Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)}px`;
  setTimeout(() => {
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
  }, 0);
}

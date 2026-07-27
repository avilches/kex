import { type Editor, Extension, Mark } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import {
  buildWikiLinkIndex,
  resolveWikiRef,
  type WikiLinkContext,
  type WikiLinkEntry,
} from "@/modules/markdown/lib/wikiLinks";
import { createMenuStore, type MenuStore } from "@/modules/markdown/rich/lib/menuStore";

// inclusive: true so typing at the end of a link extends the mark, allowing the user to
// edit a title in-place. Moving the cursor one step past the mark exits it, so typing plain
// text after a link still works normally.
export function createWikiLink(onNavigate: (path: string, title: string) => void): Mark {
  return Mark.create({
    name: "wikiLink",
    inclusive: true,
    excludes: "link",
    addAttributes() {
      return {
        title: { default: null },
        path: { default: null },
        // aliased=true when the display text was explicitly different from the note
        // title (e.g. [[Note|display]]). Aliased links are never used for rename detection.
        aliased: { default: false },
      };
    },
    parseHTML() {
      return [
        {
          tag: "span[data-wiki-link]",
          getAttrs: (el: HTMLElement) => {
            const title = el.getAttribute("data-title") || null;
            const text = el.textContent || "";
            return {
              title,
              path: el.getAttribute("data-path") || null,
              // Detect alias from the HTML: if the visible text differs from the stored
              // title the link was serialised as [[ref|display]]
              aliased: el.getAttribute("data-aliased") === "1" || (!!title && text !== title),
            };
          },
        },
        {
          tag: "a[data-wiki-link]",
          getAttrs: (el: HTMLElement) => {
            const title = el.getAttribute("data-title") || null;
            const text = el.textContent || "";
            return {
              title,
              path: el.getAttribute("data-path") || null,
              aliased: el.getAttribute("data-aliased") === "1" || (!!title && text !== title),
            };
          },
        },
      ];
    },
    renderHTML({ HTMLAttributes }) {
      const attrs: Record<string, string> = {
        "data-wiki-link": "",
        "data-path": HTMLAttributes.path || "",
        "data-title": HTMLAttributes.title || "",
        class: "wiki-link",
      };
      if (HTMLAttributes.aliased) attrs["data-aliased"] = "1";
      return ["span", attrs, 0];
    },
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("wikiLinkClick"),
          props: {
            handleDOMEvents: {
              click: (_view, event) => {
                const target = event.target as HTMLElement;
                const wikiLinkEl = target.closest?.("span[data-wiki-link]") as HTMLElement | null;
                if (wikiLinkEl) {
                  event.preventDefault();
                  event.stopPropagation();
                  const path = wikiLinkEl.getAttribute("data-path") || "";
                  // Prefer displayed text over stored title - if the user edited the link
                  // text after the note was deleted, textContent reflects the new name they
                  // want, while data-title still holds the old one.
                  const title = wikiLinkEl.textContent || wikiLinkEl.getAttribute("data-title") || "";
                  onNavigate(path, title);
                  return true;
                }
                return false;
              },
            },
          },
        }),
      ];
    },
  });
}

export type WikiLinkMenuState = {
  x: number;
  y: number;
  query: string;
  from: number;
} | null;

export type WikiLinkController = {
  extension: Extension;
  menu: MenuStore<WikiLinkMenuState>;
  selected: MenuStore<number>;
  entries: MenuStore<WikiLinkEntry[]>;
  filtered(query: string): WikiLinkEntry[];
  insert(editor: Editor, entry: WikiLinkEntry, originalRef?: string): void;
  onTransaction(editor: Editor): void;
  close(): void;
};

const ENTRIES_REFRESH_THROTTLE_MS = 30_000;

export function createWikiLinkAutocomplete(ctx: { getContext: () => WikiLinkContext }): WikiLinkController {
  const menu = createMenuStore<WikiLinkMenuState>(null);
  const selected = createMenuStore<number>(0);
  const entries = createMenuStore<WikiLinkEntry[]>([]);

  let lastEntriesRefresh = 0;

  async function refreshEntries(): Promise<void> {
    const now = Date.now();
    if (now - lastEntriesRefresh < ENTRIES_REFRESH_THROTTLE_MS) return;
    lastEntriesRefresh = now;
    try {
      const context = ctx.getContext();
      entries.set(await buildWikiLinkIndex(context.root));
    } catch (e) {
      console.error("Failed to load wiki-link entries:", e);
    }
  }

  function filtered(query: string): WikiLinkEntry[] {
    const list = entries.get();
    let q = query.toLowerCase();
    if (!q) return list;
    // Strip |alias, #heading, ^block - only use the note name part for filtering
    const pipeIdx = q.indexOf("|");
    if (pipeIdx >= 0) q = q.slice(0, pipeIdx);
    q = q.replace(/#.*$/, "").replace(/\^.*$/, "").trim();
    if (!q) return list;
    // Score: 0 = exact, 1 = starts-with, 2 = word-start, 3 = contains
    return list
      .map((entry) => {
        const t = entry.title.toLowerCase();
        let score: number;
        if (t === q) score = 0;
        else if (t.startsWith(q)) score = 1;
        else if (t.includes(` ${q}`) || t.includes(`-${q}`)) score = 2;
        else if (t.includes(q)) score = 3;
        else score = -1;
        return { entry, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.entry);
  }

  // Set of lowercase titles that appear more than once (for vault-relative-path fallback
  // on insert, so an ambiguous link survives source-mode roundtrips).
  function duplicateTitles(): Set<string> {
    const counts = new Map<string, number>();
    for (const e of entries.get()) {
      const key = e.title.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const dupes = new Set<string>();
    for (const [key, count] of counts) {
      if (count > 1) dupes.add(key);
    }
    return dupes;
  }

  function relPath(entry: WikiLinkEntry): string | null {
    const root = ctx.getContext().root;
    if (!root || !entry.path || !entry.path.startsWith(`${root}/`)) return null;
    return entry.path.slice(root.length + 1).replace(/\.md$/, "");
  }

  function close(): void {
    menu.set(null);
    selected.set(0);
  }

  function insert(editor: Editor, entry: WikiLinkEntry, originalRef?: string): void {
    const menuState = menu.get();
    if (!menuState) return;
    const { from } = menuState;
    // Delete the [[ trigger and query text
    const to = editor.state.selection.from;
    editor.chain().focus().deleteRange({ from, to }).run();
    // Insert the wiki-link mark
    // For ambiguous titles, use vault-relative path as the ref so it survives source-mode roundtrips
    const displayText = entry.title;
    let titleAttr = originalRef || entry.title;
    if (entry.path && duplicateTitles().has(entry.title.toLowerCase())) {
      const rel = relPath(entry);
      if (rel) {
        // Preserve any #heading or ^block anchors from the original ref
        const anchor = originalRef ? originalRef.replace(/^[^#^]*/, "") : "";
        titleAttr = rel + anchor;
      }
    }
    queueMicrotask(() => {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: displayText,
          marks: [{ type: "wikiLink", attrs: { title: titleAttr, path: entry.path, aliased: displayText !== titleAttr } }],
        })
        .run();
    });
    close();
  }

  function updateMenu(editor: Editor): void {
    const { state } = editor;
    const resolvedFrom = state.selection.$from;
    const parentNode = resolvedFrom.parent;
    if (parentNode.type.name !== "paragraph" && parentNode.type.name !== "heading") {
      close();
      return;
    }
    // Build textBefore from the actual ProseMirror node content so positions are accurate
    // (parentNode.textContent flattens images/atoms, causing position miscalculation)
    let textBefore = "";
    const cursorOffset = resolvedFrom.parentOffset;
    parentNode.forEach((child, offset) => {
      if (offset >= cursorOffset) return;
      if (child.isText) {
        textBefore += (child.text ?? "").slice(0, Math.min(child.nodeSize, cursorOffset - offset));
      }
    });
    // Match [[ - also allow exactly one trailing ] so the menu stays open after the
    // first ] of ]] is typed, letting handleTextInput catch the closing ]]
    const match = textBefore.match(/\[\[([^\]]*)\]?$/);
    if (!match) {
      close();
      return;
    }
    // Refresh entries when the menu first opens so newly created notes are found
    if (!menu.get()) void refreshEntries();
    const query = match[1];
    // Calculate from as cursor position minus the matched text length ("[[query")
    const from = resolvedFrom.pos - match[0].length;
    const coords = editor.view.coordsAtPos(from);
    let x = coords.left;
    if (x + 280 > window.innerWidth) x = window.innerWidth - 290;
    const menuHeight = 360;
    let y = coords.bottom + 4;
    if (y + menuHeight > window.innerHeight) y = coords.top - menuHeight - 4;
    if (y < 4) y = 4;
    menu.set({ x, y, query, from });
    selected.set(0);
  }

  const extension = Extension.create({
    name: "wikiLinkAutocomplete",
    addProseMirrorPlugins() {
      const extensionThis = this;
      return [
        new Plugin({
          key: new PluginKey("wikiLinkAutocomplete"),
          props: {
            handleKeyDown: (_view, event) => {
              const menuState = menu.get();
              if (!menuState) return false;
              const editor = extensionThis.editor;
              const items = filtered(menuState.query);
              if (event.key === "ArrowDown") {
                event.preventDefault();
                selected.set((selected.get() + 1) % Math.max(1, items.length));
                return true;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                selected.set((selected.get() - 1 + items.length) % Math.max(1, items.length));
                return true;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                if (items.length > 0) {
                  event.preventDefault();
                  insert(editor, items[selected.get()]);
                  return true;
                }
                close();
                return false;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                close();
                return true;
              }
              return false;
            },
            handleTextInput: (view, _from, _to, text) => {
              // Detect ]] closing: auto-resolve the current text as a wiki-link
              const menuState = menu.get();
              if (text === "]" && menuState) {
                const state = view.state;
                const textBefore = state.doc.textBetween(menuState.from, state.selection.from);
                if (textBefore.endsWith("]")) {
                  // Supports Obsidian syntax: [[note|alias]], [[note#heading]], [[note^block]]
                  const rawQuery = textBefore.slice(2, -1); // strip the [[ and trailing ]
                  if (rawQuery.trim()) {
                    const pipeIdx = rawQuery.indexOf("|");
                    const noteRef = (pipeIdx >= 0 ? rawQuery.slice(0, pipeIdx) : rawQuery).trim();
                    const display = (pipeIdx >= 0 ? rawQuery.slice(pipeIdx + 1) : noteRef).trim();
                    // Strip #heading and ^block for title matching
                    const titleForLookup = noteRef.replace(/#.*$/, "").replace(/\^.*$/, "").trim();
                    const context = ctx.getContext();
                    const matches = context.entries.filter(
                      (e) => e.title.toLowerCase() === titleForLookup.toLowerCase(),
                    );
                    const editor = extensionThis.editor;
                    if (matches.length === 1) {
                      insert(editor, { ...matches[0], title: display }, noteRef);
                    } else if (matches.length > 1) {
                      // Keep the menu open but filter to only the matching entries, reusing
                      // the normal filtered-menu list instead of a separate disambiguation UI
                      menu.set({ ...menuState, query: titleForLookup });
                      selected.set(0);
                    } else {
                      // No exact title match - try a full resolve (handles root-relative
                      // folder/note refs that a plain title filter would miss)
                      const resolved = resolveWikiRef(noteRef, context);
                      if (resolved) {
                        insert(editor, { ...resolved, title: display }, noteRef);
                      } else {
                        // Insert as unresolved wiki-link (no path)
                        const menuFrom = menuState.from;
                        const curTo = state.selection.from;
                        close();
                        queueMicrotask(() => {
                          // Use a single ProseMirror transaction to replace [[query] with the
                          // wiki-link and clear stored marks atomically, preventing the
                          // inclusive mark from bleeding into subsequent text. Do NOT call
                          // deleteRange first - that would shift positions and make
                          // menuFrom/curTo invalid here.
                          const { tr, schema } = editor.view.state;
                          const wikiLinkMark = schema.marks.wikiLink.create({
                            title: noteRef,
                            path: "",
                            aliased: display !== noteRef,
                          });
                          const textNode = schema.text(display, [wikiLinkMark]);
                          tr.replaceWith(menuFrom, curTo, textNode);
                          tr.setSelection(TextSelection.create(tr.doc, menuFrom + display.length));
                          tr.setStoredMarks([]);
                          editor.view.dispatch(tr);
                        });
                      }
                    }
                  } else {
                    close();
                  }
                  return true;
                }
              }
              return false;
            },
          },
        }),
      ];
    },
  });

  return {
    extension,
    menu,
    selected,
    entries,
    filtered,
    insert,
    onTransaction: (editor: Editor) => updateMenu(editor),
    close,
  };
}

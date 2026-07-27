import { type Editor, Extension } from "@tiptap/core";
// Type-only: pulls in the insertTable command augmentation (no runtime code).
import type {} from "@tiptap/extension-table";
// Type-only: pulls in toggleBulletList/toggleOrderedList/toggleTaskList/toggleCodeBlock/
// toggleBlockquote/setHorizontalRule command augmentations (no runtime code).
import type {} from "@tiptap/starter-kit";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  createMenuStore,
  type MenuStore,
} from "@/modules/markdown/rich/lib/menuStore";

export type SlashMenuState = {
  x: number;
  y: number;
  query: string;
  from: number;
  to: number;
} | null;

export type SlashCommand = {
  label: string;
  aliases: string[];
  icon: string;
  action: (editor: Editor) => void;
};

export type SlashHandlers = {
  openMathInsert: (kind: "block" | "inline") => void;
  insertCallout: (type: string) => void;
  insertDetails: () => void;
};

export type SlashMenuController = {
  extension: Extension;
  menu: MenuStore<SlashMenuState>;
  selected: MenuStore<number>;
  tablePicker: MenuStore<{ rows: number; cols: number } | null>;
  colorPicker: MenuStore<boolean>;
  filtered(query: string): SlashCommand[];
  execute(editor: Editor, index: number): void;
  insertTable(editor: Editor, rows: number, cols: number): void;
  insertColor(editor: Editor, color: string): void;
  close(): void;
  onTransaction(editor: Editor): void;
};

export const colorPresets = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#64748b",
  "#000000",
  "#ffffff",
];

export function insertTimestamp(
  editor: Editor,
  kind: "date" | "time" | "datetime",
): void {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const text = kind === "date" ? date : kind === "time" ? time : `${date} ${time}`;
  editor.chain().focus().insertContent(text).run();
}

export function createSlashMenu(handlers: SlashHandlers): SlashMenuController {
  const menu = createMenuStore<SlashMenuState>(null);
  const selected = createMenuStore<number>(0);
  const tablePicker = createMenuStore<{ rows: number; cols: number } | null>(
    null,
  );
  const colorPicker = createMenuStore<boolean>(false);

  // Set on "/" text input, cleared on the next onTransaction check. Prevents the menu
  // from reopening when the cursor merely moves into existing text like "/usr/local/bin".
  let typedByUser = false;

  const commands: SlashCommand[] = [
    {
      label: "Heading 1",
      aliases: ["h1", "heading1", "title"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h8M4 4v16M12 4v16M17 12l3-2v8"/></svg>',
      action: (editor) =>
        editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "Heading 2",
      aliases: ["h2", "heading2", "subtitle"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h8M4 4v16M12 4v16"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/></svg>',
      action: (editor) =>
        editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Heading 3",
      aliases: ["h3", "heading3"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h8M4 4v16M12 4v16"/><path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 01-2 2m2 0a2 2 0 01-2 2c-1.5 0-3.5 0-3.5-1.5"/></svg>',
      action: (editor) =>
        editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "Bullet List",
      aliases: ["ul", "unordered", "bullets", "list"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>',
      action: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered List",
      aliases: ["ol", "ordered", "number"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="1" y="9" font-size="8" fill="currentColor" stroke="none">1</text><text x="1" y="15" font-size="8" fill="currentColor" stroke="none">2</text><text x="1" y="21" font-size="8" fill="currentColor" stroke="none">3</text></svg>',
      action: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Task List",
      aliases: ["checklist", "checkbox", "todo", "check"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="6" height="6" rx="1"/><path d="M5 8l1.5 1.5L9 7"/><line x1="13" y1="8" x2="21" y2="8"/><rect x="3" y="14" width="6" height="6" rx="1"/><line x1="13" y1="17" x2="21" y2="17"/></svg>',
      action: (editor) => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: "Code Block",
      aliases: ["code", "codeblock", "pre", "snippet"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
      action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "Blockquote",
      aliases: ["quote", "blockquote", "citation"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>',
      action: (editor) => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Collapsible Section",
      aliases: ["details", "accordion", "collapse", "toggle", "summary"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="10 8 14 12 10 16"/></svg>',
      action: () => handlers.insertDetails(),
    },
    {
      label: "Callout",
      aliases: [
        "callout",
        "admonition",
        "note",
        "info",
        "tip",
        "warning",
        "caution",
        "danger",
        "success",
        "question",
        "quote",
        "aside",
        "box",
      ],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="5" x2="7" y2="19"/></svg>',
      action: () => handlers.insertCallout("note"),
    },
    {
      label: "Table",
      aliases: ["table", "grid"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
      action: () => tablePicker.set({ rows: 0, cols: 0 }),
    },
    {
      label: "Horizontal Rule",
      aliases: ["hr", "divider", "line", "separator", "rule"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="12" x2="22" y2="12"/></svg>',
      action: (editor) => editor.chain().focus().setHorizontalRule().run(),
    },
    {
      label: "Page Break",
      aliases: ["pagebreak", "page", "break", "newpage", "print"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" y1="9" x2="22" y2="9" stroke-dasharray="4 2"/><line x1="2" y1="15" x2="22" y2="15" stroke-dasharray="4 2"/><path d="M6 5v4M18 5v4M6 15v4M18 15v4"/></svg>',
      action: (editor) =>
        editor.chain().focus().insertContent({ type: "pageBreak" }).run(),
    },
    {
      label: "Math Block",
      aliases: ["math", "latex", "equation", "formula", "tex", "katex"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h6l4 14h6"/><path d="M7 19l10-14"/></svg>',
      action: () => handlers.openMathInsert("block"),
    },
    {
      label: "Math Inline",
      aliases: ["mathinline", "inline-math", "imath", "inlinemath"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h2l3 8h2"/><path d="M8 12l8-4"/></svg>',
      action: () => handlers.openMathInsert("inline"),
    },
    {
      label: "Date",
      aliases: ["date", "today", "day"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      action: (editor) => insertTimestamp(editor, "date"),
    },
    {
      label: "Time",
      aliases: ["time", "clock"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      action: (editor) => insertTimestamp(editor, "time"),
    },
    {
      label: "Date & Time",
      aliases: ["datetime", "now", "timestamp", "stamp"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><circle cx="18" cy="17" r="4"/><path d="M18 15.5v1.5l1 1"/></svg>',
      action: (editor) => insertTimestamp(editor, "datetime"),
    },
    {
      label: "Color",
      aliases: ["color", "colour", "hex", "rgb", "swatch", "palette"],
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
      action: () => colorPicker.set(true),
    },
  ];

  function filtered(query: string): SlashCommand[] {
    const q = query.toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.aliases.some((a) => a.includes(q)),
    );
  }

  function close(): void {
    menu.set(null);
    selected.set(0);
    tablePicker.set(null);
    colorPicker.set(false);
  }

  function updateMenu(editor: Editor): void {
    const wasTyped = typedByUser;
    typedByUser = false;
    if (tablePicker.get() || colorPicker.get()) return; // a sub-picker is open, don't interfere

    const { state } = editor;
    const resolvedFrom = state.selection.$from;

    // Only in empty-ish context (paragraph, heading)
    const parentNode = resolvedFrom.parent;
    if (
      parentNode.type.name !== "paragraph" &&
      parentNode.type.name !== "heading"
    ) {
      close();
      return;
    }

    const textBefore = parentNode.textContent.slice(
      0,
      resolvedFrom.parentOffset,
    );
    // Match "/" at start of line or after whitespace
    const match = textBefore.match(/(^|\s)\/([^\s]*)$/);
    if (!match) {
      close();
      return;
    }

    // Only open the menu if the user typed the slash, or the menu is already open
    // This prevents triggering when clicking/arrowing into existing paths like /usr/local/bin
    if (!menu.get() && !wasTyped) {
      return;
    }

    const query = match[2];
    const slashOffset = textBefore.length - match[0].length + match[1].length; // position of "/"
    const from = resolvedFrom.start() + slashOffset;
    const to = resolvedFrom.pos;

    // Get cursor coordinates for menu positioning
    const coords = editor.view.coordsAtPos(from);

    let x = coords.left;
    if (x + 240 > window.innerWidth) x = window.innerWidth - 250;

    const menuHeight = 300;
    let y = coords.bottom + 4;
    if (y + menuHeight > window.innerHeight) y = coords.top - menuHeight - 4;
    if (y < 4) y = 4;

    menu.set({ x, y, query, from, to });
    selected.set(0);
  }

  function execute(editor: Editor, index: number): void {
    const menuState = menu.get();
    if (!menuState) return;
    const items = filtered(menuState.query);
    if (index < 0 || index >= items.length) return;
    const cmd = items[index];
    // Table opens a sub-picker instead of closing
    if (cmd.label === "Table") {
      tablePicker.set({ rows: 0, cols: 0 });
      selected.set(0);
      // Delete slash text after opening the picker so onTransaction doesn't close the menu
      editor
        .chain()
        .focus()
        .deleteRange({ from: menuState.from, to: menuState.to })
        .run();
      return;
    }
    // Color opens a sub-picker too
    if (cmd.label === "Color") {
      colorPicker.set(true);
      selected.set(0);
      editor
        .chain()
        .focus()
        .deleteRange({ from: menuState.from, to: menuState.to })
        .run();
      return;
    }
    // Delete the slash trigger text (/ + query)
    editor
      .chain()
      .focus()
      .deleteRange({ from: menuState.from, to: menuState.to })
      .run();
    menu.set(null);
    selected.set(0);
    // Execute after the deletion is applied
    queueMicrotask(() => cmd.action(editor));
  }

  function insertTable(editor: Editor, rows: number, cols: number): void {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    close();
  }

  function insertColor(editor: Editor, color: string): void {
    const c = (color || "").trim();
    if (!c || !CSS.supports("color", c)) {
      close();
      return;
    }
    editor.chain().focus().insertContent(c).run();
    close();
  }

  const extension = Extension.create({
    name: "slashCommands",
    addProseMirrorPlugins() {
      const extensionThis = this;
      return [
        new Plugin({
          key: new PluginKey("slashCommands"),
          props: {
            handleTextInput: (_view, _from, _to, text) => {
              if (text === "/") {
                typedByUser = true;
              }
              return false;
            },
            handleKeyDown: (_view, event) => {
              if (!menu.get()) return false;
              const editor = extensionThis.editor;

              if (colorPicker.get()) {
                if (event.key === "Escape") {
                  event.preventDefault();
                  close();
                  return true;
                }
                return true; // the picker's own inputs handle the rest
              }

              const table = tablePicker.get();
              if (table) {
                if (event.key === "Escape") {
                  event.preventDefault();
                  close();
                  return true;
                }
                if (event.key === "Tab") {
                  event.preventDefault();
                  if (table.rows > 0 && table.cols > 0) {
                    insertTable(editor, table.rows, table.cols);
                  }
                  return true;
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  tablePicker.set({
                    rows: Math.max(1, table.rows),
                    cols: Math.min(10, (table.cols || 0) + 1),
                  });
                  return true;
                }
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  tablePicker.set({
                    rows: Math.max(1, table.rows),
                    cols: Math.max(1, table.cols - 1),
                  });
                  return true;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  tablePicker.set({
                    rows: Math.min(8, (table.rows || 0) + 1),
                    cols: Math.max(1, table.cols),
                  });
                  return true;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  tablePicker.set({
                    rows: Math.max(1, table.rows - 1),
                    cols: Math.max(1, table.cols),
                  });
                  return true;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (table.rows > 0 && table.cols > 0) {
                    insertTable(editor, table.rows, table.cols);
                  }
                  return true;
                }
                return true;
              }

              const menuState = menu.get();
              const items = menuState ? filtered(menuState.query) : [];
              if (event.key === "ArrowDown") {
                event.preventDefault();
                selected.set(
                  (selected.get() + 1) % Math.max(1, items.length),
                );
                return true;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                selected.set(
                  (selected.get() - 1 + items.length) %
                    Math.max(1, items.length),
                );
                return true;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                if (items.length > 0) {
                  event.preventDefault();
                  execute(editor, selected.get());
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
          },
        }),
      ];
    },
  });

  return {
    extension,
    menu,
    selected,
    tablePicker,
    colorPicker,
    filtered,
    execute,
    insertTable,
    insertColor,
    close,
    onTransaction: (editor: Editor) => updateMenu(editor),
  };
}

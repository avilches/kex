import type { Editor } from "@tiptap/core";
import { type JSX, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { insertCallout } from "@/modules/markdown/rich/extensions/callout";
import { insertDetails } from "@/modules/markdown/rich/extensions/details";
import { insertTimestamp } from "@/modules/markdown/rich/extensions/slashCommands";
import type { MenuStore } from "@/modules/markdown/rich/lib/menuStore";
import { useMenuStore } from "@/modules/markdown/rich/lib/menuStore";

const TEXT_COLORS: { name: string; value: string }[] = [
  { name: "Default", value: "" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
];

const HIGHLIGHT_COLORS: { name: string; value: string; swatch: string }[] = [
  { name: "Yellow", value: "rgba(250, 230, 100, 0.25)", swatch: "#f5e050" },
  { name: "Green", value: "rgba(100, 210, 130, 0.22)", swatch: "#5cc870" },
  { name: "Blue", value: "rgba(100, 170, 240, 0.22)", swatch: "#6aabf0" },
  { name: "Purple", value: "rgba(180, 130, 240, 0.22)", swatch: "#a878e8" },
  { name: "Pink", value: "rgba(240, 140, 180, 0.22)", swatch: "#e88aaa" },
  { name: "Red", value: "rgba(240, 120, 120, 0.22)", swatch: "#e07070" },
  { name: "Orange", value: "rgba(240, 170, 90, 0.25)", swatch: "#e8a050" },
  { name: "Cyan", value: "rgba(80, 210, 230, 0.22)", swatch: "#50cce0" },
];

const TABLE_PICKER_ROWS = 8;
const TABLE_PICKER_COLS = 10;

type LinkRange = { from: number; to: number };

function Icon(props: { size?: number; children: ReactNode }): JSX.Element {
  return (
    <svg
      width={props.size ?? 12}
      height={props.size ?? 12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {props.children}
    </svg>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth={3}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ToolbarButton(props: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        "flex size-[22px] shrink-0 items-center justify-center rounded transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        props.active
          ? "bg-accent text-foreground"
          : "text-muted-foreground",
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}

function Divider(): JSX.Element {
  return <div className="mx-1 h-4 w-px shrink-0 bg-border" />;
}

function DropdownItem(props: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] whitespace-nowrap",
        props.active ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/50",
      )}
    >
      {props.children}
    </button>
  );
}

export function Toolbar(props: {
  editor: Editor | null;
  tick: MenuStore<number>;
  onOpenMathInsert: (kind: "block" | "inline") => void;
}): JSX.Element {
  const { editor, onOpenMathInsert } = props;
  useMenuStore(props.tick);

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkRange, setLinkRange] = useState<LinkRange | null>(null);
  const [tableHover, setTableHover] = useState({ rows: 0, cols: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!openDropdown) return;
    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpenDropdown(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenDropdown(null);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openDropdown]);

  useEffect(() => {
    if (openDropdown === "link") linkInputRef.current?.focus();
  }, [openDropdown]);

  function toggleDropdown(id: string): void {
    setOpenDropdown((current) => (current === id ? null : id));
  }

  function isActive(name: string, attrs?: Record<string, unknown>): boolean {
    return editor?.isActive(name, attrs) ?? false;
  }

  function insertImage(): void {
    if (!editor) return;
    const src = window.prompt("Image path or URL:");
    if (!src) return;
    editor.chain().focus().setImage({ src }).run();
  }

  function setTextColor(value: string): void {
    if (!editor) return;
    if (value === "") editor.chain().focus().unsetColor().run();
    else editor.chain().focus().setColor(value).run();
    setOpenDropdown(null);
  }

  function setHighlightColor(value: string): void {
    if (!editor) return;
    if (value === "") editor.chain().focus().unsetHighlight().run();
    else editor.chain().focus().setHighlight({ color: value }).run();
    setOpenDropdown(null);
  }

  function openLinkPopover(): void {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    setLinkRange({ from, to });
    const href = editor.getAttributes("link").href as string | undefined;
    setLinkUrl(href ? decodeURIComponent(href) : "");
    setOpenDropdown("link");
  }

  function confirmLink(): void {
    if (!editor || !linkRange) return;
    let url = linkUrl.trim();
    if (url === "") {
      editor
        .chain()
        .focus()
        .setTextSelection(linkRange)
        .extendMarkRange("link")
        .unsetLink()
        .run();
    } else {
      if (
        !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) &&
        !url.startsWith("/") &&
        !url.startsWith("#") &&
        !url.endsWith(".md")
      ) {
        url = `https://${url}`;
      }
      const href = url.replace(/[()]/g, (c) => encodeURIComponent(c));
      if (linkRange.from === linkRange.to) {
        editor
          .chain()
          .focus()
          .insertContentAt(linkRange.from, {
            type: "text",
            text: url,
            marks: [{ type: "link", attrs: { href } }],
          })
          .run();
      } else {
        editor
          .chain()
          .focus()
          .setTextSelection(linkRange)
          .setLink({ href })
          .run();
      }
    }
    setOpenDropdown(null);
    setLinkUrl("");
    setLinkRange(null);
  }

  function insertTablePick(rows: number, cols: number): void {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    setOpenDropdown(null);
    setTableHover({ rows: 0, cols: 0 });
  }

  function indent(): void {
    if (!editor) return;
    const sank = editor.chain().focus().sinkListItem("listItem").run();
    if (!sank) {
      const sankTask = editor.chain().focus().sinkListItem("taskItem").run();
      if (!sankTask && editor.state.selection.empty) {
        editor.chain().focus().insertContent("\t").run();
      }
    }
  }

  function outdent(): void {
    if (!editor) return;
    const lifted = editor.chain().focus().liftListItem("listItem").run();
    if (!lifted) {
      const liftedTask = editor.chain().focus().liftListItem("taskItem").run();
      if (!liftedTask && editor.state.selection.empty) {
        const { from } = editor.state.selection;
        const pos = editor.state.doc.resolve(from);
        const lineStart = pos.start(pos.depth);
        const lineText = editor.state.doc.textBetween(
          lineStart,
          pos.end(pos.depth),
        );
        if (lineText.startsWith("\t")) {
          editor
            .chain()
            .focus()
            .command(({ tr }) => {
              tr.delete(lineStart, lineStart + 1);
              return true;
            })
            .run();
        } else if (lineText.startsWith("    ")) {
          editor
            .chain()
            .focus()
            .command(({ tr }) => {
              tr.delete(lineStart, lineStart + 4);
              return true;
            })
            .run();
        } else if (lineText.startsWith("  ")) {
          editor
            .chain()
            .focus()
            .command(({ tr }) => {
              tr.delete(lineStart, lineStart + 2);
              return true;
            })
            .run();
        }
      }
    }
  }

  const alignActive = (v: string) => editor?.isActive({ textAlign: v }) ?? false;

  return (
    <div
      ref={containerRef}
      className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-background px-1.5"
    >
      {/* 1. Insert (+) dropdown */}
      <div className="relative">
        <ToolbarButton
          title="Insert"
          active={openDropdown === "insert"}
          onClick={() => toggleDropdown("insert")}
        >
          <Icon>
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </Icon>
        </ToolbarButton>
        {openDropdown === "insert" && (
          <div className="absolute top-full left-0 z-50 mt-1 w-48 rounded-md border border-border bg-popover py-1 shadow-md">
            <DropdownItem onClick={() => { setOpenDropdown(null); insertImage(); }}>
              <Icon>
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 00-2.828 0L6 21" />
              </Icon>
              Image
            </DropdownItem>
            <DropdownItem
              onClick={() => {
                setOpenDropdown(null);
                editor?.chain().focus().setHorizontalRule().run();
              }}
            >
              <Icon>
                <path d="M5 12h14" />
              </Icon>
              Horizontal Rule
            </DropdownItem>
            <DropdownItem
              onClick={() => {
                setOpenDropdown(null);
                editor?.chain().focus().insertContent({ type: "pageBreak" }).run();
              }}
            >
              <Icon>
                <rect x="4" y="2" width="16" height="8" rx="1" />
                <rect x="4" y="14" width="16" height="8" rx="1" />
                <path d="M2 12h20" strokeDasharray="2 2" />
              </Icon>
              Page Break
            </DropdownItem>
            <DropdownItem
              onClick={() => {
                setOpenDropdown(null);
                onOpenMathInsert("block");
              }}
            >
              <Icon>
                <path d="M18 6V4H6l6 8-6 8h12v-2" />
              </Icon>
              Math Block
            </DropdownItem>
            <DropdownItem
              onClick={() => {
                setOpenDropdown(null);
                onOpenMathInsert("inline");
              }}
            >
              <Icon>
                <path d="M8 4c-2 3-2 13 0 16" />
                <path d="M16 4c2 3 2 13 0 16" />
              </Icon>
              Math Inline
            </DropdownItem>
            <DropdownItem
              onClick={() => {
                setOpenDropdown(null);
                if (editor) insertTimestamp(editor, "date");
              }}
            >
              <Icon>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </Icon>
              Date
            </DropdownItem>
            <DropdownItem
              onClick={() => {
                setOpenDropdown(null);
                if (editor) insertTimestamp(editor, "time");
              }}
            >
              <Icon>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </Icon>
              Time
            </DropdownItem>
            <DropdownItem
              onClick={() => {
                setOpenDropdown(null);
                if (editor) insertTimestamp(editor, "datetime");
              }}
            >
              <Icon>
                <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <circle cx="18" cy="17" r="4" />
                <path d="M18 15.5v1.5l1 1" />
              </Icon>
              Date and Time
            </DropdownItem>
            <DropdownItem
              onClick={() => {
                setOpenDropdown(null);
                if (editor) insertDetails(editor);
              }}
            >
              <Icon>
                <rect width="13" height="7" x="8" y="3" rx="1" />
                <path d="m2 9 3 3-3 3" />
                <rect width="13" height="7" x="8" y="14" rx="1" />
              </Icon>
              Collapsible Section
            </DropdownItem>
            <DropdownItem
              onClick={() => {
                setOpenDropdown(null);
                if (editor) insertCallout(editor, "note");
              }}
            >
              <Icon>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <line x1="7" y1="5" x2="7" y2="19" />
              </Icon>
              Callout
            </DropdownItem>
          </div>
        )}
      </div>

      <Divider />

      {/* 2. Heading dropdown */}
      <div className="relative">
        <ToolbarButton
          title="Heading"
          active={openDropdown === "heading" || isActive("heading")}
          onClick={() => toggleDropdown("heading")}
        >
          <Icon>
            <path d="M6 12h12" />
            <path d="M6 20V4" />
            <path d="M18 20V4" />
          </Icon>
        </ToolbarButton>
        {openDropdown === "heading" && (
          <div className="absolute top-full left-0 z-50 mt-1 w-32 rounded-md border border-border bg-popover py-1 shadow-md">
            <DropdownItem
              active={isActive("heading", { level: 1 })}
              onClick={() => {
                editor?.chain().focus().toggleHeading({ level: 1 }).run();
                setOpenDropdown(null);
              }}
            >
              Heading 1
            </DropdownItem>
            <DropdownItem
              active={isActive("heading", { level: 2 })}
              onClick={() => {
                editor?.chain().focus().toggleHeading({ level: 2 }).run();
                setOpenDropdown(null);
              }}
            >
              Heading 2
            </DropdownItem>
            <DropdownItem
              active={isActive("heading", { level: 3 })}
              onClick={() => {
                editor?.chain().focus().toggleHeading({ level: 3 }).run();
                setOpenDropdown(null);
              }}
            >
              Heading 3
            </DropdownItem>
            <DropdownItem
              active={isActive("paragraph")}
              onClick={() => {
                editor?.chain().focus().setParagraph().run();
                setOpenDropdown(null);
              }}
            >
              Paragraph
            </DropdownItem>
          </div>
        )}
      </div>

      <Divider />

      {/* 3. Bold, Italic, Underline, Strikethrough */}
      <ToolbarButton
        title="Bold"
        active={isActive("bold")}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Icon>
          <path d="M6 12h9a4 4 0 010 8H7a1 1 0 01-1-1V5a1 1 0 011-1h7a4 4 0 010 8" />
        </Icon>
      </ToolbarButton>
      <ToolbarButton
        title="Italic"
        active={isActive("italic")}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Icon>
          <line x1="19" x2="10" y1="4" y2="4" />
          <line x1="14" x2="5" y1="20" y2="20" />
          <line x1="15" x2="9" y1="4" y2="20" />
        </Icon>
      </ToolbarButton>
      <ToolbarButton
        title="Underline"
        active={isActive("underline")}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      >
        <Icon>
          <path d="M6 4v6a6 6 0 0012 0V4" />
          <line x1="4" x2="20" y1="20" y2="20" />
        </Icon>
      </ToolbarButton>
      <ToolbarButton
        title="Strikethrough"
        active={isActive("strike")}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      >
        <Icon>
          <path d="M16 4H9a3 3 0 00-2.83 4" />
          <path d="M14 12a4 4 0 010 8H6" />
          <line x1="4" x2="20" y1="12" y2="12" />
        </Icon>
      </ToolbarButton>

      <Divider />

      {/* 4. Text Color dropdown */}
      <div className="relative">
        <ToolbarButton
          title="Text Color"
          active={openDropdown === "color"}
          onClick={() => toggleDropdown("color")}
        >
          <Icon>
            <path d="M4 20h16" />
            <path d="m6 16 6-12 6 12" />
            <path d="M8 12h8" />
          </Icon>
        </ToolbarButton>
        {openDropdown === "color" && (
          <div className="absolute top-full left-0 z-50 mt-1 grid grid-cols-4 gap-1 rounded-md border border-border bg-popover p-1.5 shadow-md">
            {TEXT_COLORS.map((c) => {
              const current = editor?.getAttributes("textStyle").color as
                | string
                | undefined;
              const active = c.value === "" ? !current : current === c.value;
              return (
                <button
                  key={c.name}
                  type="button"
                  title={c.name}
                  onClick={() => setTextColor(c.value)}
                  style={{ background: c.value || "var(--foreground)" }}
                  className="relative flex size-5 items-center justify-center rounded border border-border/60"
                >
                  {active && <CheckIcon />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Divider />

      {/* 5. Inline Code, Code Block */}
      <ToolbarButton
        title="Inline Code"
        active={isActive("code")}
        onClick={() => editor?.chain().focus().toggleCode().run()}
      >
        <Icon>
          <path d="m16 18 6-6-6-6" />
          <path d="m8 6-6 6 6 6" />
        </Icon>
      </ToolbarButton>
      <ToolbarButton
        title="Code Block"
        active={isActive("codeBlock")}
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
      >
        <Icon>
          <path d="m10 9-3 3 3 3" />
          <path d="m14 15 3-3-3-3" />
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </Icon>
      </ToolbarButton>

      <Divider />

      {/* 6. Link */}
      <div className="relative">
        <ToolbarButton
          title="Link"
          active={isActive("link") || openDropdown === "link"}
          onClick={openLinkPopover}
        >
          <Icon>
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </Icon>
        </ToolbarButton>
        {openDropdown === "link" && (
          <div className="absolute top-full left-0 z-50 mt-1 flex w-64 items-center gap-1 rounded-md border border-border bg-popover p-1.5 shadow-md">
            <input
              ref={linkInputRef}
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmLink();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpenDropdown(null);
                }
              }}
              placeholder="https://..."
              className="h-6 min-w-0 flex-1 rounded border border-border bg-transparent px-1.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={confirmLink}
              className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-foreground hover:bg-accent"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      <Divider />

      {/* 7. Bullet List, Ordered List, Task List */}
      <ToolbarButton
        title="Bullet List"
        active={isActive("bulletList")}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <Icon>
          <path d="M3 5h.01" />
          <path d="M3 12h.01" />
          <path d="M3 19h.01" />
          <path d="M8 5h13" />
          <path d="M8 12h13" />
          <path d="M8 19h13" />
        </Icon>
      </ToolbarButton>
      <ToolbarButton
        title="Ordered List"
        active={isActive("orderedList")}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <Icon>
          <path d="M11 5h10" />
          <path d="M11 12h10" />
          <path d="M11 19h10" />
          <path d="M4 4h1v5" />
          <path d="M4 9h2" />
          <path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 00-2.6-1.02" />
        </Icon>
      </ToolbarButton>
      <ToolbarButton
        title="Task List"
        active={isActive("taskList")}
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      >
        <Icon>
          <path d="M13 5h8" />
          <path d="M13 12h8" />
          <path d="M13 19h8" />
          <path d="m3 17 2 2 4-4" />
          <path d="m3 7 2 2 4-4" />
        </Icon>
      </ToolbarButton>

      <Divider />

      {/* 8. Indent, Outdent */}
      <ToolbarButton title="Indent" onClick={indent}>
        <Icon>
          <line x1="3" y1="4" x2="21" y2="4" />
          <line x1="11" y1="9" x2="21" y2="9" />
          <line x1="11" y1="14" x2="21" y2="14" />
          <line x1="3" y1="19" x2="21" y2="19" />
          <polyline points="3 9 7 11.5 3 14" />
        </Icon>
      </ToolbarButton>
      <ToolbarButton title="Outdent" onClick={outdent}>
        <Icon>
          <line x1="3" y1="4" x2="21" y2="4" />
          <line x1="11" y1="9" x2="21" y2="9" />
          <line x1="11" y1="14" x2="21" y2="14" />
          <line x1="3" y1="19" x2="21" y2="19" />
          <polyline points="7 9 3 11.5 7 14" />
        </Icon>
      </ToolbarButton>

      <Divider />

      {/* 9. Quote, Collapsible Section, Callout */}
      <ToolbarButton
        title="Quote"
        active={isActive("blockquote")}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      >
        <Icon>
          <path d="M17 5H3" />
          <path d="M21 12H8" />
          <path d="M21 19H8" />
          <path d="M3 12v7" />
        </Icon>
      </ToolbarButton>
      <ToolbarButton
        title="Collapsible Section"
        active={isActive("details")}
        onClick={() => {
          if (editor) insertDetails(editor);
        }}
      >
        <Icon>
          <rect width="13" height="7" x="8" y="3" rx="1" />
          <path d="m2 9 3 3-3 3" />
          <rect width="13" height="7" x="8" y="14" rx="1" />
        </Icon>
      </ToolbarButton>
      <ToolbarButton
        title="Callout"
        active={isActive("callout")}
        onClick={() => {
          if (editor) insertCallout(editor, "note");
        }}
      >
        <Icon>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <line x1="7" y1="5" x2="7" y2="19" />
        </Icon>
      </ToolbarButton>

      <Divider />

      {/* 10. Table picker dropdown */}
      <div className="relative">
        <ToolbarButton
          title="Insert Table"
          active={openDropdown === "table"}
          onClick={() => toggleDropdown("table")}
        >
          <Icon>
            <path d="M12 3v18" />
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18" />
            <path d="M3 15h18" />
          </Icon>
        </ToolbarButton>
        {openDropdown === "table" && (
          <div className="absolute top-full left-0 z-50 mt-1 rounded-md border border-border bg-popover p-2 shadow-md">
            <div
              className="grid gap-[2px]"
              style={{
                gridTemplateColumns: `repeat(${TABLE_PICKER_COLS}, 14px)`,
                gridTemplateRows: `repeat(${TABLE_PICKER_ROWS}, 14px)`,
              }}
            >
              {Array.from({ length: TABLE_PICKER_ROWS }, (_, r) =>
                Array.from({ length: TABLE_PICKER_COLS }, (_, c) => {
                  const active = r < tableHover.rows && c < tableHover.cols;
                  return (
                    <div
                      key={`${r}-${c}`}
                      className={cn(
                        "size-[14px] rounded-[2px] border",
                        active
                          ? "border-accent-foreground/40 bg-accent"
                          : "border-border bg-muted/30",
                      )}
                      onMouseEnter={() =>
                        setTableHover({ rows: r + 1, cols: c + 1 })
                      }
                      onClick={() => insertTablePick(r + 1, c + 1)}
                    />
                  );
                }),
              )}
            </div>
            <div className="mt-1.5 text-center text-[11px] text-muted-foreground">
              {tableHover.rows > 0
                ? `${tableHover.rows} x ${tableHover.cols}`
                : "Select size"}
            </div>
          </div>
        )}
      </div>

      {/* 11. Horizontal Rule */}
      <ToolbarButton
        title="Horizontal Rule"
        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
      >
        <Icon>
          <path d="M5 12h14" />
        </Icon>
      </ToolbarButton>

      <Divider />

      {/* 12. Highlight dropdown (split button: main toggles first color) */}
      <div className="relative flex items-center">
        <ToolbarButton
          title="Highlight"
          active={isActive("highlight")}
          className="rounded-r-none"
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .toggleHighlight({ color: HIGHLIGHT_COLORS[0].value })
              .run()
          }
        >
          <Icon>
            <path d="m9 11-6 6v3h9l3-3" />
            <path d="m22 12-4.6 4.6a2 2 0 01-2.8 0l-5.2-5.2a2 2 0 010-2.8L14 4" />
          </Icon>
        </ToolbarButton>
        <button
          type="button"
          title="Highlight color"
          onClick={() => toggleDropdown("highlight")}
          className={cn(
            "flex h-[22px] w-3 shrink-0 items-center justify-center rounded-r text-muted-foreground transition-colors hover:text-foreground",
            openDropdown === "highlight" && "bg-accent text-foreground",
          )}
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {openDropdown === "highlight" && (
          <div className="absolute top-full left-0 z-50 mt-1 flex w-max items-center gap-1 rounded-md border border-border bg-popover p-1.5 shadow-md">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                onClick={() => setHighlightColor(c.value)}
                style={{ background: c.swatch }}
                className="relative flex size-5 items-center justify-center rounded border border-border/60"
              >
                {isActive("highlight", { color: c.value }) && <CheckIcon />}
              </button>
            ))}
            <button
              type="button"
              title="Remove highlight"
              onClick={() => setHighlightColor("")}
              className="flex size-5 items-center justify-center rounded border border-border/60 bg-muted"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 13. Subscript, Superscript */}
      <ToolbarButton
        title="Subscript"
        active={isActive("subscript")}
        onClick={() => editor?.chain().focus().toggleSubscript().run()}
      >
        <Icon>
          <path d="m4 5 8 8" />
          <path d="m12 5-8 8" />
          <path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 00-2.62-.44c-.42.24-.74.62-.9 1.07" />
        </Icon>
      </ToolbarButton>
      <ToolbarButton
        title="Superscript"
        active={isActive("superscript")}
        onClick={() => editor?.chain().focus().toggleSuperscript().run()}
      >
        <Icon>
          <path d="m4 19 8-8" />
          <path d="m12 19-8-8" />
          <path d="M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 00-2.617-.436c-.42.239-.738.614-.899 1.06" />
        </Icon>
      </ToolbarButton>

      <Divider />

      {/* 14. Align dropdown */}
      <div className="relative">
        <ToolbarButton
          title="Text Alignment"
          active={openDropdown === "align"}
          onClick={() => toggleDropdown("align")}
        >
          {alignActive("center") ? (
            <Icon>
              <path d="M21 5H3" />
              <path d="M17 12H7" />
              <path d="M19 19H5" />
            </Icon>
          ) : alignActive("right") ? (
            <Icon>
              <path d="M21 5H3" />
              <path d="M21 12H9" />
              <path d="M21 19H7" />
            </Icon>
          ) : alignActive("justify") ? (
            <Icon>
              <path d="M3 5h18" />
              <path d="M3 12h18" />
              <path d="M3 19h18" />
            </Icon>
          ) : (
            <Icon>
              <path d="M21 5H3" />
              <path d="M15 12H3" />
              <path d="M17 19H3" />
            </Icon>
          )}
        </ToolbarButton>
        {openDropdown === "align" && (
          <div className="absolute top-full left-0 z-50 mt-1 w-28 rounded-md border border-border bg-popover py-1 shadow-md">
            <DropdownItem
              active={alignActive("left")}
              onClick={() => {
                editor?.chain().focus().setTextAlign("left").run();
                setOpenDropdown(null);
              }}
            >
              <Icon>
                <path d="M21 5H3" />
                <path d="M15 12H3" />
                <path d="M17 19H3" />
              </Icon>
              Left
            </DropdownItem>
            <DropdownItem
              active={alignActive("center")}
              onClick={() => {
                editor?.chain().focus().setTextAlign("center").run();
                setOpenDropdown(null);
              }}
            >
              <Icon>
                <path d="M21 5H3" />
                <path d="M17 12H7" />
                <path d="M19 19H5" />
              </Icon>
              Center
            </DropdownItem>
            <DropdownItem
              active={alignActive("right")}
              onClick={() => {
                editor?.chain().focus().setTextAlign("right").run();
                setOpenDropdown(null);
              }}
            >
              <Icon>
                <path d="M21 5H3" />
                <path d="M21 12H9" />
                <path d="M21 19H7" />
              </Icon>
              Right
            </DropdownItem>
            <DropdownItem
              active={alignActive("justify")}
              onClick={() => {
                editor?.chain().focus().setTextAlign("justify").run();
                setOpenDropdown(null);
              }}
            >
              <Icon>
                <path d="M3 5h18" />
                <path d="M3 12h18" />
                <path d="M3 19h18" />
              </Icon>
              Justify
            </DropdownItem>
          </div>
        )}
      </div>

      <Divider />

      {/* 15. Undo, Redo */}
      <ToolbarButton
        title="Undo"
        onClick={() => editor?.chain().focus().undo().run()}
      >
        <Icon>
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 015.5 5.5 5.5 5.5 0 01-5.5 5.5H11" />
        </Icon>
      </ToolbarButton>
      <ToolbarButton
        title="Redo"
        onClick={() => editor?.chain().focus().redo().run()}
      >
        <Icon>
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9.5A5.5 5.5 0 004 14.5 5.5 5.5 0 009.5 20H13" />
        </Icon>
      </ToolbarButton>
    </div>
  );
}

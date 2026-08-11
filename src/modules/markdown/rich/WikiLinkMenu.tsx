import type { Editor } from "@tiptap/core";
import { type ReactElement, useEffect, useRef } from "react";
import type { WikiLinkEntry } from "@/modules/markdown/lib/wikiLinks";
import { useMenuStore } from "@/modules/markdown/rich/lib/menuStore";
import type { WikiLinkController } from "@/modules/markdown/rich/extensions/wikiLink";

const MAX_RESULTS = 8;

function folderPath(entry: WikiLinkEntry, root: string): string {
  if (!root || !entry.path) return "";
  const path = entry.path.replace(/\\/g, "/");
  const rel = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
  const parts = rel.split("/");
  return parts.length > 1 ? `${parts.slice(0, -1).join("/")}/` : "";
}

export function WikiLinkMenu(props: {
  controller: WikiLinkController;
  editor: Editor;
  root: string;
}): ReactElement | null {
  const { controller, editor, root } = props;
  const menu = useMenuStore(controller.menu);
  const selected = useMenuStore(controller.selected);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu || selected < 0) return;
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [menu, selected]);

  if (!menu) return null;

  const items = controller.filtered(menu.query).slice(0, MAX_RESULTS);

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={() => controller.close()}
      onKeyDown={(e) => {
        if (e.key === "Escape") controller.close();
      }}
    >
      <div
        className="bg-popover border-border fixed rounded-md border shadow-md text-[12px]"
        style={{ left: menu.x, top: menu.y }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {items.length === 0 ? (
          <div className="text-muted-foreground px-3 py-2">
            {menu.query ? "No matching notes" : "Type to search notes..."}
          </div>
        ) : (
          <div ref={listRef} className="max-h-72 w-64 overflow-auto py-1">
            {items.map((entry, i) => {
              const folder = folderPath(entry, root);
              return (
                <button
                  key={entry.path || entry.title}
                  type="button"
                  data-selected={i === selected}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left ${
                    i === selected ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                  onMouseEnter={() => controller.selected.set(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    controller.insert(editor, entry);
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-muted-foreground shrink-0"
                  >
                    <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                    <polyline points="13 2 13 9 20 9" />
                  </svg>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-foreground truncate">{entry.title}</span>
                    {folder && <span className="text-muted-foreground truncate">{folder}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

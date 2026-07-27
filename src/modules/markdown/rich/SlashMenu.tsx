import type { Editor } from "@tiptap/core";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useMenuStore } from "@/modules/markdown/rich/lib/menuStore";
import {
  colorPresets,
  type SlashMenuController,
} from "@/modules/markdown/rich/extensions/slashCommands";

const TABLE_ROWS = 8;
const TABLE_COLS = 10;

export function SlashMenu(props: {
  controller: SlashMenuController;
  editor: Editor;
}): ReactElement | null {
  const { controller, editor } = props;
  const menu = useMenuStore(controller.menu);
  const selected = useMenuStore(controller.selected);
  const tablePicker = useMenuStore(controller.tablePicker);
  const colorPicker = useMenuStore(controller.colorPicker);
  const [colorHex, setColorHex] = useState("#4b6abf");
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (colorPicker) {
      queueMicrotask(() => colorInputRef.current?.focus());
    }
  }, [colorPicker]);

  useEffect(() => {
    if (!menu || selected < 0) return;
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [menu, selected]);

  if (!menu) return null;

  const items = controller.filtered(menu.query);
  const hexIsValid = /^#[0-9a-fA-F]{6}$/.test(colorHex);

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
        {tablePicker ? (
          <div className="p-2">
            <div
              className="grid gap-[2px]"
              style={{
                gridTemplateColumns: `repeat(${TABLE_COLS}, 14px)`,
                gridTemplateRows: `repeat(${TABLE_ROWS}, 14px)`,
              }}
            >
              {Array.from({ length: TABLE_ROWS }, (_, r) =>
                Array.from({ length: TABLE_COLS }, (_, c) => {
                  const active = r < tablePicker.rows && c < tablePicker.cols;
                  return (
                    <div
                      key={`${r}-${c}`}
                      className={`size-[14px] rounded-[2px] border ${
                        active
                          ? "bg-accent border-accent-foreground/40"
                          : "bg-muted/30 border-border"
                      }`}
                      onMouseEnter={() =>
                        controller.tablePicker.set({
                          rows: r + 1,
                          cols: c + 1,
                        })
                      }
                      onMouseDown={(e) => {
                        e.preventDefault();
                        controller.insertTable(editor, r + 1, c + 1);
                      }}
                    />
                  );
                }),
              )}
            </div>
            <div className="text-muted-foreground mt-1.5 text-center">
              {tablePicker.rows > 0
                ? `${tablePicker.rows} x ${tablePicker.cols}`
                : "Select table size"}
            </div>
          </div>
        ) : colorPicker ? (
          <div className="w-56 p-2">
            <div className="grid grid-cols-6 gap-1.5">
              {colorPresets.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="border-border size-5 rounded border"
                  style={{ background: c }}
                  title={c}
                  aria-label={c}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    controller.insertColor(editor, c);
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="color"
                value={hexIsValid ? colorHex : "#4b6abf"}
                onChange={(e) => setColorHex(e.target.value)}
                title="Pick a color"
                className="size-6 shrink-0 border-0 bg-transparent p-0"
              />
              <input
                ref={colorInputRef}
                type="text"
                value={colorHex}
                placeholder="#hex or rgb(...)"
                onChange={(e) => setColorHex(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    controller.insertColor(editor, colorHex);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    controller.close();
                  }
                }}
                className="border-border h-6 min-w-0 flex-1 rounded border bg-transparent px-1.5 text-foreground focus:outline-none"
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  controller.insertColor(editor, colorHex);
                }}
                className="border-border hover:bg-accent rounded border px-1.5 py-0.5"
              >
                Insert
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground px-3 py-2">
            No matching commands
          </div>
        ) : (
          <div ref={listRef} className="max-h-72 overflow-auto py-1">
            {items.map((cmd, i) => (
              <button
                key={cmd.label}
                type="button"
                data-selected={i === selected}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left ${
                  i === selected ? "bg-accent" : "hover:bg-accent/50"
                }`}
                onMouseEnter={() => controller.selected.set(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  controller.execute(editor, i);
                }}
              >
                <span
                  className="text-muted-foreground shrink-0"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: static icon strings ported verbatim from the source command list
                  dangerouslySetInnerHTML={{ __html: cmd.icon }}
                />
                <span className="text-foreground">{cmd.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

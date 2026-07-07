import type { Editor } from "@tiptap/core";
import { type JSX, useEffect, useRef, useState } from "react";
import type { MenuStore } from "@/modules/markdown/rich/lib/menuStore";
import { useMenuStore } from "@/modules/markdown/rich/lib/menuStore";

const OUTLINE_DEBOUNCE_MS = 250;
const MIN_WIDTH = 160;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 224;

export type OutlineHeading = { level: number; text: string; pos: number };

function collectHeadings(editor: Editor): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      headings.push({
        level: node.attrs.level as number,
        text: node.textContent,
        pos,
      });
    }
  });
  return headings;
}

export function OutlinePanel(props: {
  editor: Editor | null;
  tick: MenuStore<number>;
  onClose: () => void;
}): JSX.Element {
  const { editor, onClose } = props;
  const tickValue = useMenuStore(props.tick);
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor) {
      setHeadings([]);
      return;
    }
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      setHeadings(collectHeadings(editor));
    }, OUTLINE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [editor, tickValue]);

  function scrollToHeading(pos: number): void {
    if (!editor) return;
    editor.commands.setTextSelection(pos + 1);
    editor.commands.scrollIntoView();
    editor.view.focus();
  }

  return (
    <div
      className="relative flex h-full shrink-0 border-l border-border bg-background"
      style={{ width }}
    >
      <div
        className="absolute inset-y-0 left-0 z-10 flex w-1 -translate-x-1/2 cursor-col-resize items-center justify-center outline-none"
        onPointerDown={(e) => {
          const startX = e.clientX;
          const startWidth = width;
          e.currentTarget.setPointerCapture(e.pointerId);
          const onMove = (ev: PointerEvent) => {
            const next = Math.min(
              MAX_WIDTH,
              Math.max(MIN_WIDTH, startWidth - (ev.clientX - startX)),
            );
            setWidth(next);
          };
          const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
          };
          document.addEventListener("pointermove", onMove);
          document.addEventListener("pointerup", onUp);
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-2.5">
          <h3 className="text-[12px] font-medium text-foreground">
            Outline
          </h3>
          <button
            type="button"
            title="Close outline"
            onClick={onClose}
            className="flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {headings.length === 0 ? (
          <div className="px-2.5 py-2 text-[12px] text-muted-foreground">
            No headings in this note.
          </div>
        ) : (
          <div className="thin-scrollbar flex-1 overflow-auto py-1">
            {headings.map((h) => (
              <button
                key={h.pos}
                type="button"
                onClick={() => scrollToHeading(h.pos)}
                style={{ paddingLeft: 10 + (h.level - 1) * 12 }}
                className="block w-full truncate py-1 pr-2.5 text-left text-[12px] text-muted-foreground hover:text-foreground"
              >
                {h.text || "Untitled"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { lazy, Suspense, useCallback, useLayoutEffect, useRef, useState } from "react";
import type React from "react";
import { cn } from "@/lib/utils";
import type { CodeMirrorEditorHandle } from "@/modules/markdown/codemirror/CodeMirrorEditor";
import { moveTabNote, setTabNoteText } from "./lib/tabNote";
import { useTabNoteStore } from "./lib/tabNoteStore";
import { clampNotePos, resolveNotePos, type Point, type Rect, type Size } from "./lib/notePlacement";
import type { Tab } from "./lib/types";

const CodeMirrorEditor = lazy(() =>
  import("@/modules/markdown/codemirror/CodeMirrorEditor").then((m) => ({ default: m.CodeMirrorEditor })),
);

// Marker read by PaneView so interacting with the note never moves terminal focus.
export const TAB_NOTE_ATTR = "data-tab-note";

type Props = {
  tab: Tab;
  active: boolean;
  paneRef: React.RefObject<HTMLElement | null>;
  tabBarRef: React.RefObject<HTMLElement | null>;
  // Changes whenever the tab strip layout may have changed (tab list or order).
  layoutKey: string;
  onUpdateTab?: (tabId: string, updater: (p: Tab) => Tab) => void;
};

type Measure = { pane: Rect; tab: Rect | null; note: Size; tabBarHeight: number };

function toRect(r: DOMRect): Rect {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function sameRect(a: Rect, b: Rect) {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

function sameMeasure(a: Measure, b: Measure) {
  return (
    sameRect(a.pane, b.pane) &&
    (a.tab === b.tab || (!!a.tab && !!b.tab && sameRect(a.tab, b.tab))) &&
    a.note.width === b.note.width &&
    a.note.height === b.note.height &&
    a.tabBarHeight === b.tabBarHeight
  );
}

export function FloatingTabNote({ tab, active, paneRef, tabBarRef, layoutKey, onUpdateTab }: Props) {
  const visible = active && tab.note !== undefined && !!tab.noteOpen;
  const noteRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Measure | null>(null);
  const [dragPos, setDragPos] = useState<Point | null>(null);
  // pos lives here, not only in state: pointerup can fire before React re-renders the last move.
  const dragRef = useRef<{ startX: number; startY: number; origin: Point; pos: Point | null } | null>(null);

  const setEditor = useCallback(
    (handle: CodeMirrorEditorHandle | null) => {
      if (!handle) return;
      const store = useTabNoteStore.getState();
      if (store.focusTabId !== tab.id) return;
      store.clearFocus();
      // The CodeMirror view is created in the child's effect, after this ref fires.
      requestAnimationFrame(() => handle.focus());
    },
    [tab.id],
  );

  const measure = useCallback(() => {
    const paneEl = paneRef.current;
    const noteEl = noteRef.current;
    if (!paneEl || !noteEl) return;
    const tabEl = paneEl.querySelector(`[data-tab-id="${CSS.escape(tab.id)}"]`);
    const next: Measure = {
      pane: toRect(paneEl.getBoundingClientRect()),
      tab: tabEl ? toRect(tabEl.getBoundingClientRect()) : null,
      note: { width: noteEl.offsetWidth, height: noteEl.offsetHeight },
      tabBarHeight: tabBarRef.current?.offsetHeight ?? 0,
    };
    setM((prev) => (prev && sameMeasure(prev, next) ? prev : next));
  }, [paneRef, tabBarRef, tab.id]);

  useLayoutEffect(() => {
    if (visible) measure();
  }, [visible, measure, layoutKey]);

  useLayoutEffect(() => {
    if (!visible) return;
    const paneEl = paneRef.current;
    const noteEl = noteRef.current;
    const barEl = tabBarRef.current;
    if (!paneEl || !noteEl) return;
    const ro = new ResizeObserver(measure);
    ro.observe(paneEl);
    ro.observe(noteEl);
    // A tab before the active one changing width (title, badges) shifts the docked x.
    for (const el of barEl?.querySelectorAll("[data-tab-id]") ?? []) ro.observe(el);
    // scroll does not bubble; capture catches the tab strip's own scroll container.
    barEl?.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      barEl?.removeEventListener("scroll", measure, true);
    };
  }, [visible, measure, paneRef, tabBarRef, layoutKey]);

  if (!visible) return null;

  const resolved = m
    ? resolveNotePos({ notePos: tab.notePos, tab: m.tab, pane: m.pane, note: m.note, tabBarHeight: m.tabBarHeight })
    : null;
  const pos = dragPos ?? resolved;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !resolved) return;
    // Keeps text selection and DOM focus where they were while dragging.
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: resolved, pos: null };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || !m) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.pos && dx === 0 && dy === 0) return;
    d.pos = clampNotePos({ x: d.origin.x + dx, y: d.origin.y + dy }, m.pane, m.note, m.tabBarHeight);
    setDragPos(d.pos);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>, commit: boolean) {
    const d = dragRef.current;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (d?.pos && commit) {
      const target = d.pos;
      onUpdateTab?.(tab.id, (p) => moveTabNote(p, target));
    }
    setDragPos(null);
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <div
        ref={noteRef}
        {...{ [TAB_NOTE_ATTR]: "" }}
        className={cn(
          "pointer-events-auto absolute w-80 max-w-full overflow-hidden rounded-lg border border-border bg-popover shadow-xl",
          !pos && "invisible",
        )}
        style={{ left: pos?.x ?? 0, top: pos?.y ?? 0 }}
        onMouseDown={(e) => e.stopPropagation()}
        onFocus={(e) => e.stopPropagation()}
      >
        <div
          data-testid="tab-note-handle"
          className={cn(
            "h-3 cursor-grab border-b border-border/60 bg-muted/40",
            dragPos && "cursor-grabbing",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endDrag(e, true)}
          onPointerCancel={(e) => endDrag(e, false)}
          onLostPointerCapture={(e) => {
            if (dragRef.current) endDrag(e, false);
          }}
        />
        <div className="min-h-8 bg-[var(--editor-background)] text-[var(--editor-foreground)]">
          <Suspense fallback={<pre className="whitespace-pre-wrap p-2 text-[12px]">{tab.note}</pre>}>
            <CodeMirrorEditor
              ref={setEditor}
              value={tab.note ?? ""}
              syncKey={tab.id}
              path=""
              mode="rich"
              maxHeight="16rem"
              onChange={(next) => onUpdateTab?.(tab.id, (p) => setTabNoteText(p, next))}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

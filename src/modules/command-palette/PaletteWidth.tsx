import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  clampPaletteWidth,
  DEFAULT_PALETTE_WIDTH,
  MAX_PALETTE_WIDTH,
  MIN_PALETTE_WIDTH,
  paletteBox,
  widthAfterDrag,
} from "@/lib/paletteWidth";
import { setPaletteWidth } from "@/modules/settings/store";
import { usePreferencesStore } from "@/modules/settings/preferences";

// Classes the palette dialogs pass so the inline width is not capped by the primitive's max-width.
export const PALETTE_WIDTH_CLASS = "sm:max-w-[calc(100vw-32px)]";

type Screen = { width: number; height: number; ratio: number };

let screen: Screen | null = null;
const listeners = new Set<() => void>();

function readScreen(): Screen {
  return { width: window.innerWidth, height: window.innerHeight, ratio: window.devicePixelRatio };
}

function refreshScreen() {
  const next = readScreen();
  if (screen && next.width === screen.width && next.height === screen.height && next.ratio === screen.ratio) return;
  screen = next;
  for (const listener of listeners) listener();
}

// The window size and the pixel ratio, which changes when the window moves to another monitor or the
// page is zoomed. The snapshot keeps its identity until one of them changes.
function subscribeScreen(listener: () => void): () => void {
  if (listeners.size === 0) {
    refreshScreen();
    window.addEventListener("resize", refreshScreen);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("resize", refreshScreen);
  };
}

const getScreen = (): Screen => (screen ??= readScreen());

type Drag = { edge: "left" | "right"; startX: number; startWidth: number };

// The width the palettes share: saved in the preferences, changed by dragging either side edge
// of the dialog, which grows or shrinks around its center and stays where it was left.
export function usePaletteWidth() {
  const saved = usePreferencesStore((s) => s.paletteWidth);
  const [live, setLive] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const width = live ?? saved;
  const view = useSyncExternalStore(subscribeScreen, getScreen);

  const commit = useCallback((next: number) => {
    const clamped = clampPaletteWidth(next);
    usePreferencesStore.setState({ paletteWidth: clamped });
    void setPaletteWidth(clamped);
  }, []);

  const handlers = (edge: "left" | "right") => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { edge, startX: e.clientX, startWidth: width };
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      setLive(widthAfterDrag(d.startWidth, e.clientX - d.startX, d.edge));
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      commit(widthAfterDrag(d.startWidth, e.clientX - d.startX, d.edge));
      setLive(null);
    },
    onDoubleClick: () => commit(DEFAULT_PALETTE_WIDTH),
  });

  const handleClass =
    "absolute inset-y-3 z-10 w-2 cursor-ew-resize touch-none rounded-full transition-colors hover:bg-foreground/10 active:bg-foreground/15";
  const handles = (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize palette"
        aria-valuenow={width}
        aria-valuemin={MIN_PALETTE_WIDTH}
        aria-valuemax={MAX_PALETTE_WIDTH}
        title="Drag to resize, double-click to reset"
        className={`${handleClass} left-0.5`}
        {...handlers("left")}
      />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize palette"
        aria-valuenow={width}
        aria-valuemin={MIN_PALETTE_WIDTH}
        aria-valuemax={MAX_PALETTE_WIDTH}
        title="Drag to resize, double-click to reset"
        className={`${handleClass} right-0.5`}
        {...handlers("right")}
      />
    </>
  );

  const box = paletteBox(width, view.width, view.height, view.ratio);
  return {
    contentStyle: { width: box.width, left: box.left, top: box.top },
    handles,
  };
}

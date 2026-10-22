import { useCallback, useRef, useState } from "react";
import {
  clampPaletteWidth,
  DEFAULT_PALETTE_WIDTH,
  paletteWidthCss,
  widthAfterDrag,
} from "@/lib/paletteWidth";
import { setPaletteWidth } from "@/modules/settings/store";
import { usePreferencesStore } from "@/modules/settings/preferences";

// Classes the palette dialogs pass so the inline width is not capped by the primitive's max-width.
export const PALETTE_WIDTH_CLASS = "sm:max-w-[calc(100vw-32px)]";

type Drag = { edge: "left" | "right"; startX: number; startWidth: number };

// The width the palettes share: saved in the preferences, changed by dragging either side edge
// of the dialog, which grows or shrinks around its center and stays where it was left.
export function usePaletteWidth() {
  const saved = usePreferencesStore((s) => s.paletteWidth);
  const [live, setLive] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const width = live ?? saved;

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
        title="Drag to resize, double-click to reset"
        className={`${handleClass} left-0.5`}
        {...handlers("left")}
      />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize palette"
        title="Drag to resize, double-click to reset"
        className={`${handleClass} right-0.5`}
        {...handlers("right")}
      />
    </>
  );

  return { contentStyle: { width: paletteWidthCss(width) }, handles };
}

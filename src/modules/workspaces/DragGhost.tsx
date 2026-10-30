import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const GHOST_OFFSET = 8;

// Follows the pointer in viewport coordinates from the body, so it neither
// depends on where the dragged row was grabbed nor on the app zoom, which a
// DragOverlay inside `.zoom-content` would inherit. The wrapper only
// translates; the zoom goes on the inner node so it scales the content, not the offset.
export function DragGhost({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      el.style.transform = `translate3d(${e.clientX + GHOST_OFFSET}px, ${e.clientY + GHOST_OFFSET}px, 0)`;
      el.style.visibility = "visible";
    };
    window.addEventListener("pointermove", move, true);
    return () => window.removeEventListener("pointermove", move, true);
  }, []);

  return createPortal(
    <div
      ref={ref}
      className="pointer-events-none fixed top-0 left-0 z-[1000]"
      style={{ visibility: "hidden" }}
    >
      <div className="zoom-content">{children}</div>
    </div>,
    document.body,
  );
}

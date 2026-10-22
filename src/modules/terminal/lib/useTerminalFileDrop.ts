import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect } from "react";
import { isOwnNativeDrag } from "@/modules/explorer/lib/nativeDragOut";
import { useTerminalDropStore } from "./dropStore";
import { formatDroppedPaths } from "./quoteShellPath";
import { pasteIntoLeaf } from "./rendererPool";

// Tauri reports the drop point in physical pixels on some platforms and logical
// on others; only scale down when it overflows the logical viewport.
function leafIdAt(x: number, y: number): string | null {
  let lx = x;
  let ly = y;
  if (x > window.innerWidth || y > window.innerHeight) {
    const dpr = window.devicePixelRatio || 1;
    lx = x / dpr;
    ly = y / dpr;
  }
  const el = document.elementFromPoint(lx, ly);
  const leafEl = el?.closest<HTMLElement>("[data-pane-leaf]");
  if (!leafEl) return null;
  const id = leafEl.dataset.paneLeaf;
  return id ?? null;
}

/** Wires native OS file drops into the terminal pane under the cursor: shows a
 * drop overlay on that pane while dragging, and bracketed-pastes the
 * shell-quoted path(s) on drop. Drops outside any terminal leaf are ignored. */
export function useTerminalFileDrop(): void {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    const setTarget = useTerminalDropStore.getState().setTarget;
    let own = false;

    void getCurrentWebview()
      .onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "enter") own = isOwnNativeDrag(p.paths);
        if (p.type === "enter" || p.type === "over") {
          if (own) return;
          setTarget(leafIdAt(p.position.x, p.position.y));
          return;
        }
        if (p.type === "leave") {
          own = false;
          setTarget(null);
          return;
        }
        if (p.type === "drop") {
          const wasOwn = own || isOwnNativeDrag(p.paths);
          own = false;
          setTarget(null);
          if (wasOwn || !p.paths.length) return;
          const leafId = leafIdAt(p.position.x, p.position.y);
          if (leafId !== null) {
            pasteIntoLeaf(leafId, formatDroppedPaths(p.paths));
          }
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((err) => console.error("[kex] drag-drop listen failed:", err));

    return () => {
      disposed = true;
      setTarget(null);
      unlisten?.();
    };
  }, []);
}

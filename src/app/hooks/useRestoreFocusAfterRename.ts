import { useEffect } from "react";
import { useTabRenameStore } from "@/modules/workspaces/lib/tabRenameStore";
import { useWorkspaceRenameStore } from "@/modules/workspaces/lib/workspaceRenameStore";

const CLICK_AWAY_MS = 400;

// Enter and Escape always hand the focus back. Only a click on another control right
// before the field closed leaves that control with the focus.
export function shouldRestoreFocus(
  active: Element | null,
  body: Element,
  msSincePointerDown: number,
): boolean {
  if (!active || active === body) return true;
  return msSincePointerDown > CLICK_AWAY_MS;
}

export function useRestoreFocusAfterRename(focusActiveTab: () => void) {
  useEffect(() => {
    let frame = 0;
    let lastPointerDown = -Infinity;
    const onPointerDown = () => {
      lastPointerDown = performance.now();
    };
    const onClosed = () => {
      cancelAnimationFrame(frame);
      const closedAt = performance.now();
      frame = requestAnimationFrame(() => {
        if (shouldRestoreFocus(document.activeElement, document.body, closedAt - lastPointerDown)) {
          focusActiveTab();
        }
      });
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    const unsubTab = useTabRenameStore.subscribe((s, prev) => {
      if (prev.renamingTabId !== null && s.renamingTabId === null) onClosed();
    });
    const unsubWorkspace = useWorkspaceRenameStore.subscribe((s, prev) => {
      if (prev.renamingId !== null && s.renamingId === null) onClosed();
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown, true);
      unsubTab();
      unsubWorkspace();
    };
  }, [focusActiveTab]);
}

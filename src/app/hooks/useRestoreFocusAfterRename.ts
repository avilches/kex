import { useEffect } from "react";
import { useTabRenameStore } from "@/modules/workspaces/lib/tabRenameStore";
import { useWorkspaceRenameStore } from "@/modules/workspaces/lib/workspaceRenameStore";

// After the rename field closes its popover unmounts and focus falls to the body. If
// the user clicked another control instead, that control owns the focus and stays.
export function shouldRestoreFocus(active: Element | null, body: Element): boolean {
  return !active || active === body;
}

export function useRestoreFocusAfterRename(focusActiveTab: () => void) {
  useEffect(() => {
    let frame = 0;
    const onClosed = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (shouldRestoreFocus(document.activeElement, document.body)) focusActiveTab();
      });
    };
    const unsubTab = useTabRenameStore.subscribe((s, prev) => {
      if (prev.renamingTabId !== null && s.renamingTabId === null) onClosed();
    });
    const unsubWorkspace = useWorkspaceRenameStore.subscribe((s, prev) => {
      if (prev.renamingId !== null && s.renamingId === null) onClosed();
    });
    return () => {
      cancelAnimationFrame(frame);
      unsubTab();
      unsubWorkspace();
    };
  }, [focusActiveTab]);
}

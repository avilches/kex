import { useEffect, useRef } from "react";
import { toast } from "sonner";

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

// A reload conflict is normally surfaced by a blocking overlay inside the tab
// itself, but a tab that isn't currently visible (hidden pane, background
// workspace) never shows it: tabs are never unmounted when hidden, so the
// overlay just renders in a subtree nobody looks at. This fires a toast the
// moment a conflict rises while the tab is not visible, so it isn't missed
// until the user happens to switch back to it.
export function useBackgroundConflictToast(conflict: boolean, visible: boolean, path: string): void {
  const wasConflictRef = useRef(conflict);
  useEffect(() => {
    const rising = conflict && !wasConflictRef.current;
    wasConflictRef.current = conflict;
    if (rising && !visible && path) {
      toast.warning(`${basename(path)} changed on disk`, {
        description: "Switch to this tab to keep your changes or reload from disk.",
      });
    }
  }, [conflict, visible, path]);
}

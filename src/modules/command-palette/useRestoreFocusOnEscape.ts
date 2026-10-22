import { useCallback, useRef } from "react";

// A palette has no trigger element, so closing it leaves the focus on the page body. Closing it
// with Escape gives the focus back to the tab that had it; any other way of closing (a pick, a
// click elsewhere) keeps deciding its own focus.
export function useRestoreFocusOnEscape(restore: () => void) {
  const escaped = useRef(false);
  const onEscapeKeyDown = useCallback(() => {
    escaped.current = true;
  }, []);
  const onCloseAutoFocus = useCallback(
    (event: Event) => {
      event.preventDefault();
      if (!escaped.current) return;
      escaped.current = false;
      restore();
    },
    [restore],
  );
  return { onEscapeKeyDown, onCloseAutoFocus };
}

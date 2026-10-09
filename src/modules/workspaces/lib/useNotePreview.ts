import { useCallback, useEffect, useRef, useState } from "react";

// Which tab's note is being previewed by hovering its icon. Leaving is delayed so the
// pointer can travel from the icon to the note, and skipped while the note holds focus.
export function useNotePreview(isHeld: (tabId: string) => boolean, delayMs = 250) {
  const [tabId, setTabId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(isHeld);
  heldRef.current = isHeld;

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const show = useCallback(
    (id: string) => {
      cancel();
      setTabId(id);
    },
    [cancel],
  );

  const leave = useCallback(
    (id: string) => {
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        if (heldRef.current(id)) return;
        setTabId((cur) => (cur === id ? null : cur));
      }, delayMs);
    },
    [cancel, delayMs],
  );

  const close = useCallback(() => {
    cancel();
    setTabId(null);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  return { tabId, show, leave, close };
}

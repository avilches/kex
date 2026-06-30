import { useCallback, useRef, useState } from "react";
import {
  getSavedSidebarState,
  saveSidebarState,
  sanitizeSidebarState,
  type SidebarSide,
  type SidebarView,
  type SidebarUiState,
} from "./sidebarState";

// Per-window sidebar chrome (open/view/width/side) as React state,
// seeded from the restored window entry. Every setter persists with debounce.
// The returned ref always points at the live value so event handlers can read
// the latest state synchronously without re-subscribing.
export function useSidebarState(label: string) {
  const [state, setState] = useState<SidebarUiState>(() =>
    getSavedSidebarState(),
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const apply = useCallback(
    (patch: Partial<SidebarUiState>) => {
      const next = sanitizeSidebarState({ ...stateRef.current, ...patch });
      stateRef.current = next;
      setState(next);
      saveSidebarState(label, next);
    },
    [label],
  );

  const setOpen = useCallback(
    (open: boolean) => apply({ open }),
    [apply],
  );
  const setView = useCallback(
    (view: SidebarView) => apply({ view }),
    [apply],
  );
  const setSide = useCallback(
    (side: SidebarSide) => apply({ side }),
    [apply],
  );
  const setWidth = useCallback(
    (width: number) => apply({ width }),
    [apply],
  );

  return {
    open: state.open,
    view: state.view,
    side: state.side,
    width: state.width,
    stateRef,
    setOpen,
    setView,
    setSide,
    setWidth,
  };
}

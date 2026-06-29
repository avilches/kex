import { useCallback, useRef, useState } from "react";
import {
  getSavedRightPanelState,
  saveRightPanelState,
  sanitizeRightPanelState,
  type RightPanelSide,
  type RightPanelTabId,
  type RightPanelUiState,
} from "./windowUiState";

// Per-window right-panel chrome (open/activeTab/width/side) as React state,
// seeded from the restored window entry. Every setter persists with debounce.
// The returned ref always points at the live value so event handlers can read
// the latest state synchronously without re-subscribing.
export function useRightPanelState(label: string) {
  const [state, setState] = useState<RightPanelUiState>(() =>
    getSavedRightPanelState(),
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const apply = useCallback(
    (patch: Partial<RightPanelUiState>) => {
      const next = sanitizeRightPanelState({ ...stateRef.current, ...patch });
      stateRef.current = next;
      setState(next);
      saveRightPanelState(label, next);
    },
    [label],
  );

  const setOpen = useCallback(
    (open: boolean) => apply({ open }),
    [apply],
  );
  const setActiveTab = useCallback(
    (activeTab: RightPanelTabId) => apply({ activeTab }),
    [apply],
  );
  const setSide = useCallback(
    (side: RightPanelSide) => apply({ side }),
    [apply],
  );

  return {
    open: state.open,
    activeTab: state.activeTab,
    side: state.side,
    stateRef,
    setOpen,
    setActiveTab,
    setSide,
  };
}

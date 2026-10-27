// Lets the app activate a tab while a palette keeps the keyboard: every focus request deferred
// to a frame or a late mount goes through `run`, so none of them lands after the gate closed,
// however late it fires.
export type FocusGate = {
  hold: () => void;
  release: () => void;
  run: (focus: () => void) => void;
};

export function createFocusGate(): FocusGate {
  let held = false;
  return {
    hold: () => {
      held = true;
    },
    release: () => {
      held = false;
    },
    run: (focus) => {
      if (!held) focus();
    },
  };
}

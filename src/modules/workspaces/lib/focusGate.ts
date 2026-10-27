// Lets the app activate a tab while a palette keeps the keyboard: every focus request deferred
// to a frame or a late mount goes through `run`, so none of them lands after the gate closed,
// however late it fires.
export type FocusGate = {
  hold: () => void;
  release: () => void;
  run: (focus: () => void) => void;
  isHeld: () => boolean;
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
    isHeld: () => held,
  };
}

// Shared by the app and the terminal: requestLeafFocus is the lowest point every focus of a
// terminal goes through, so a held gate stops the visibility effect and the deferred unhide too.
export const paletteFocusGate = createFocusGate();

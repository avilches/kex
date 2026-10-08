export const HOVER_SWITCH_DELAY_MS = 600;

export type HoverSwitch = {
  enter: (id: string) => void;
  leave: (id: string) => void;
  cancel: () => void;
};

export function createHoverSwitch(
  onSwitch: (id: string) => void,
  delayMs: number = HOVER_SWITCH_DELAY_MS,
): HoverSwitch {
  let pending: { id: string; timer: ReturnType<typeof setTimeout> } | null = null;

  const cancel = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
  };

  return {
    enter(id) {
      if (pending?.id === id) return;
      cancel();
      pending = {
        id,
        timer: setTimeout(() => {
          pending = null;
          onSwitch(id);
        }, delayMs),
      };
    },
    leave(id) {
      if (pending?.id === id) cancel();
    },
    cancel,
  };
}

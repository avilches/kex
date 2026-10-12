export type RevealPlan = "animate" | "settle";

// A zero-height or reduced-motion reveal never fires `transitionend`, so it has
// to settle at once instead of waiting for an event that will not come.
export function planReveal(contentHeight: number, reducedMotion: boolean): RevealPlan {
  return contentHeight <= 0 || reducedMotion ? "settle" : "animate";
}

export const REVEAL_FALLBACK_MS = 400;

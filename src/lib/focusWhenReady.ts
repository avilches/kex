export type FrameScheduler = {
  request: (cb: () => void) => number;
  cancel: (id: number) => void;
};

const browserFrames: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

// A freshly opened tab has no view until its content loads, so a single focus
// call lands on nothing. Retry once per frame until `tryFocus` reports success.
export function focusWhenReady(
  tryFocus: () => boolean,
  maxFrames = 120,
  frames: FrameScheduler = browserFrames,
): () => void {
  let left = maxFrames;
  let id = 0;
  const step = () => {
    if (tryFocus() || --left <= 0) return;
    id = frames.request(step);
  };
  id = frames.request(step);
  return () => frames.cancel(id);
}

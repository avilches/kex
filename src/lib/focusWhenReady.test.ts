import { describe, expect, it } from "vitest";
import { focusWhenReady, type FrameScheduler } from "@/lib/focusWhenReady";

function manualFrames() {
  const queue = new Map<number, () => void>();
  let next = 1;
  const frames: FrameScheduler = {
    request: (cb) => {
      queue.set(next, cb);
      return next++;
    },
    cancel: (id) => void queue.delete(id),
  };
  const tick = () => {
    const first = [...queue][0];
    if (!first) return false;
    queue.delete(first[0]);
    first[1]();
    return true;
  };
  return { frames, tick, pending: () => queue.size };
}

describe("focusWhenReady", () => {
  it("retries every frame until the focus succeeds", () => {
    const { frames, tick, pending } = manualFrames();
    let calls = 0;
    focusWhenReady(() => ++calls === 3, 10, frames);
    while (tick());
    expect(calls).toBe(3);
    expect(pending()).toBe(0);
  });

  it("gives up after maxFrames", () => {
    const { frames, tick } = manualFrames();
    let calls = 0;
    focusWhenReady(() => (calls++, false), 4, frames);
    while (tick());
    expect(calls).toBe(4);
  });

  it("stops when cancelled", () => {
    const { frames, tick } = manualFrames();
    let calls = 0;
    const cancel = focusWhenReady(() => (calls++, false), 10, frames);
    tick();
    cancel();
    tick();
    expect(calls).toBe(1);
  });
});

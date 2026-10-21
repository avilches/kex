import { info } from "@tauri-apps/plugin-log";
import { takeCensus } from "./domCensus";
import {
  buildReport,
  createAccumulator,
  describeCallback,
  formatReport,
  originOf,
  recordCallback,
  recordFrameGap,
} from "./rafStats";

const REPORT_EVERY_MS = 10_000;
const JANK_MS = 100;

let stopActive: (() => void) | null = null;

function write(line: string): void {
  void info(line).catch(() => {});
}

export function startProfiler(windowLabel: string): void {
  if (stopActive) return;
  const original = window.requestAnimationFrame;
  let acc = createAccumulator();
  let windowStart = performance.now();
  let lastFrame: number | null = null;
  let frameId = 0;

  const wrapped = (cb: FrameRequestCallback): number => {
    if (typeof cb !== "function") return original.call(window, cb);
    const origin = originOf(describeCallback(cb), new Error().stack);
    return original.call(window, (t) => {
      const start = performance.now();
      try {
        cb(t);
      } finally {
        recordCallback(acc, origin, performance.now() - start);
      }
    });
  };
  window.requestAnimationFrame = wrapped;

  const tick = (t: number) => {
    if (lastFrame !== null) recordFrameGap(acc, t - lastFrame, JANK_MS);
    lastFrame = t;
    frameId = original.call(window, tick);
  };
  frameId = original.call(window, tick);

  // Frames stop while the window is hidden, and that gap is not jank.
  const onVisibility = () => {
    lastFrame = null;
  };
  document.addEventListener("visibilitychange", onVisibility);

  const report = () => {
    const now = performance.now();
    write(formatReport(buildReport(acc, now - windowStart, takeCensus(document), windowLabel)));
    acc = createAccumulator();
    windowStart = now;
  };
  const timer = setInterval(report, REPORT_EVERY_MS);

  write(`[profiler] started ${windowLabel}`);
  stopActive = () => {
    clearInterval(timer);
    cancelAnimationFrame(frameId);
    document.removeEventListener("visibilitychange", onVisibility);
    if (window.requestAnimationFrame === wrapped) window.requestAnimationFrame = original;
    write(`[profiler] stopped ${windowLabel}`);
  };
}

export function stopProfiler(): void {
  stopActive?.();
  stopActive = null;
}

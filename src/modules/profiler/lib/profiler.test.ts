// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const info = vi.fn((_line: string) => Promise.resolve());
vi.mock("@tauri-apps/plugin-log", () => ({ info }));

const { startProfiler, stopProfiler } = await import("./profiler");

let frames: FrameRequestCallback[];
let nativeRaf: typeof window.requestAnimationFrame;

function lastLine(): string {
  return info.mock.calls[info.mock.calls.length - 1][0];
}

function runFrames(t: number): void {
  const due = frames;
  frames = [];
  for (const cb of due) cb(t);
}

describe("profiler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    info.mockClear();
    frames = [];
    nativeRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => frames.push(cb);
    window.cancelAnimationFrame = () => {};
  });

  afterEach(() => {
    stopProfiler();
    window.requestAnimationFrame = nativeRaf;
    vi.useRealTimers();
  });

  it("wraps requestAnimationFrame while running and restores the original after", () => {
    const before = window.requestAnimationFrame;
    startProfiler("main");
    expect(window.requestAnimationFrame).not.toBe(before);
    stopProfiler();
    expect(window.requestAnimationFrame).toBe(before);
  });

  it("still runs the wrapped callback with the frame time", () => {
    startProfiler("main");
    const seen: number[] = [];
    window.requestAnimationFrame((t) => seen.push(t));
    runFrames(42);
    expect(seen).toEqual([42]);
  });

  it("passes a non-function through to the native call untouched", () => {
    startProfiler("main");
    expect(() => window.requestAnimationFrame(undefined as never)).not.toThrow();
  });

  it("starts once and logs a tagged report every ten seconds", () => {
    startProfiler("main");
    startProfiler("main");
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenLastCalledWith("[profiler] started main");
    window.requestAnimationFrame(() => {});
    runFrames(10);
    vi.advanceTimersByTime(10_000);
    const line = lastLine();
    expect(line.startsWith("[profiler] {")).toBe(true);
    const report = JSON.parse(line.slice("[profiler] ".length));
    expect(report.rafCalls).toBe(1);
    expect(report.window).toBe("main");
    expect(report.census.nodes).toBeGreaterThan(0);
  });

  it("counts a frame gap above 100 ms as jank", () => {
    startProfiler("main");
    runFrames(0);
    runFrames(16);
    runFrames(300);
    vi.advanceTimersByTime(10_000);
    const report = JSON.parse(lastLine().slice("[profiler] ".length));
    expect(report.jankFrames).toBe(1);
    expect(report.worstGapMs).toBe(284);
  });

  it("stops reporting once stopped", () => {
    startProfiler("main");
    stopProfiler();
    info.mockClear();
    vi.advanceTimersByTime(30_000);
    expect(info).not.toHaveBeenCalled();
  });
});

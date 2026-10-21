export type OriginStat = { calls: number; ms: number; max: number };

export type Accumulator = {
  origins: Map<string, OriginStat>;
  callbackMs: number;
  callbacks: number;
  frames: number;
  jankFrames: number;
  worstGapMs: number;
};

export type Census = {
  nodes: number;
  xterms: number;
  domRendererTerminals: number;
  webglTerminals: number;
  domRows: number;
};

export type OriginRow = {
  origin: string;
  calls: number;
  ms: number;
  avg: number;
  max: number;
};

export type ProfilerReport = {
  windowMs: number;
  rafShare: number;
  rafMs: number;
  rafCalls: number;
  frames: number;
  jankFrames: number;
  worstGapMs: number;
  census: Census;
  top: OriginRow[];
};

const FRAMES_PER_ORIGIN = 6;
const BODY_CHARS = 70;
const REPORT_PREFIX = "[profiler]";

export function createAccumulator(): Accumulator {
  return {
    origins: new Map(),
    callbackMs: 0,
    callbacks: 0,
    frames: 0,
    jankFrames: 0,
    worstGapMs: 0,
  };
}

export function recordCallback(acc: Accumulator, origin: string, ms: number): void {
  const stat = acc.origins.get(origin) ?? { calls: 0, ms: 0, max: 0 };
  stat.calls += 1;
  stat.ms += ms;
  if (ms > stat.max) stat.max = ms;
  acc.origins.set(origin, stat);
  acc.callbackMs += ms;
  acc.callbacks += 1;
}

export function recordFrameGap(acc: Accumulator, gapMs: number, jankMs: number): void {
  acc.frames += 1;
  if (gapMs >= jankMs) acc.jankFrames += 1;
  if (gapMs > acc.worstGapMs) acc.worstGapMs = gapMs;
}

export function describeCallback(cb: (...args: never[]) => unknown): string {
  const body = Function.prototype.toString.call(cb).replace(/\s+/g, " ").slice(0, BODY_CHARS);
  return `[${cb.name || "anon"}: ${body}]`;
}

function shortFrame(line: string): string {
  const at = line.indexOf("@");
  const fn = at >= 0 ? line.slice(0, at) : "";
  const location = (at >= 0 ? line.slice(at + 1) : line).replace(/\?[^:]*/, "");
  const file = location.split("/").slice(-2).join("/");
  return `${fn || "anon"}@${file}`;
}

// The first frame is the wrapper that created the Error, so it says nothing about the caller.
export function originOf(label: string, stack: string | undefined): string {
  if (!stack) return label;
  const frames = stack
    .split("\n")
    .slice(1, 1 + FRAMES_PER_ORIGIN)
    .filter((l) => l.trim() !== "")
    .map(shortFrame);
  return frames.length > 0 ? `${label} ${frames.join(" < ")}` : label;
}

export function buildReport(
  acc: Accumulator,
  windowMs: number,
  census: Census,
  topN = 12,
): ProfilerReport {
  const top = [...acc.origins.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, topN)
    .map(([origin, s]) => ({
      origin,
      calls: s.calls,
      ms: Math.round(s.ms),
      avg: Number((s.ms / s.calls).toFixed(2)),
      max: Number(s.max.toFixed(1)),
    }));
  return {
    windowMs: Math.round(windowMs),
    rafShare: windowMs > 0 ? Number((acc.callbackMs / windowMs).toFixed(3)) : 0,
    rafMs: Math.round(acc.callbackMs),
    rafCalls: acc.callbacks,
    frames: acc.frames,
    jankFrames: acc.jankFrames,
    worstGapMs: Math.round(acc.worstGapMs),
    census,
    top,
  };
}

export function formatReport(report: ProfilerReport): string {
  return `${REPORT_PREFIX} ${JSON.stringify(report)}`;
}

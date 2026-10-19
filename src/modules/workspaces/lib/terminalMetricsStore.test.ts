// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";

import {
  clearMetricsEntry,
  setMetrics,
  setMetricsBatch,
  useMetrics,
  type TabMetrics,
} from "./terminalMetricsStore";

let seq = 0;
function mk(cpu: number): TabMetrics {
  return { pid: 42, cpuPercent: cpu, memBytes: 2048, shellName: "zsh" };
}

function useRenderCount(tabId: string): number {
  const renders = useRef(-1);
  renders.current += 1;
  useMetrics(tabId);
  return renders.current;
}

describe("terminalMetricsStore", () => {
  it("a sampler cycle notifies each tab at most once and only when its entry changed", () => {
    const ta = `ta-${seq}`;
    const tb = `tb-${seq}`;
    const tc = `tc-${seq}`;
    seq += 3;
    setMetricsBatch([
      [ta, mk(1)],
      [tb, mk(2)],
      [tc, mk(3)],
    ]);

    const a = renderHook(() => useRenderCount(ta));
    const b = renderHook(() => useRenderCount(tb));
    const c = renderHook(() => useRenderCount(tc));

    expect(a.result.current).toBe(0);
    expect(b.result.current).toBe(0);
    expect(c.result.current).toBe(0);

    act(() => {
      setMetricsBatch([
        [ta, mk(9)],
        [tb, mk(2)], // unchanged
        [tc, mk(1)],
      ]);
    });

    expect(a.result.current).toBe(1);
    expect(b.result.current).toBe(0);
    expect(c.result.current).toBe(1);

    act(() => {
      setMetricsBatch([
        [ta, mk(9)], // unchanged again
        [tb, mk(5)],
        [tc, mk(1)], // unchanged again
      ]);
    });

    expect(a.result.current).toBe(1);
    expect(b.result.current).toBe(1);
    expect(c.result.current).toBe(1);

    act(() => {
      clearMetricsEntry(ta);
    });
    expect(a.result.current).toBe(2);
  });

  it("useMetrics returns the entry and keeps identity while values stay equal", () => {
    const t = `tx-${seq}`;
    const metrics = mk(4);
    setMetrics(t, metrics);
    const { result } = renderHook(() => useMetrics(t));
    expect(result.current?.cpuPercent).toBe(4);
    expect(result.current).toBe(metrics);

    act(() => {
      setMetrics(t, { ...metrics });
    });
    expect(result.current).toBe(metrics);

    act(() => {
      setMetrics(t, mk(6));
    });
    expect(result.current?.cpuPercent).toBe(6);
  });
});

// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPendingRestore,
  setPendingRestore,
  subscribePendingRestore,
  usePendingRestore,
} from "./pendingRestore";

const block = { reason: "r", dir: "/w", command: "claude", restorable: true };

afterEach(() => {
  setPendingRestore("a", null);
  setPendingRestore("b", null);
});

describe("pendingRestore", () => {
  it("returns null when empty and the stored reference once set", () => {
    expect(getPendingRestore("a")).toBeNull();
    setPendingRestore("a", block);
    expect(getPendingRestore("a")).toBe(block);
  });

  it("usePendingRestore renders once, re-renders only for its own leaf and does not loop", () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renders = 0;
    function Probe() {
      const b = usePendingRestore("a");
      renders++;
      return <span>{b ? b.reason : "none"}</span>;
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<Probe />));
    expect(renders).toBe(1);
    expect(container.textContent).toBe("none");
    act(() => setPendingRestore("b", block));
    expect(renders).toBe(1);
    act(() => setPendingRestore("a", block));
    expect(renders).toBe(2);
    expect(container.textContent).toBe("r");
    act(() => setPendingRestore("a", null));
    expect(renders).toBe(3);
    act(() => root.unmount());
  });

  it("notifies only subscribers of that leaf", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribePendingRestore("a", a);
    subscribePendingRestore("b", b);
    setPendingRestore("a", block);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it("does not notify when clearing an already empty leaf", () => {
    const a = vi.fn();
    subscribePendingRestore("a", a);
    setPendingRestore("a", null);
    expect(a).not.toHaveBeenCalled();
    setPendingRestore("a", block);
    setPendingRestore("a", null);
    expect(a).toHaveBeenCalledTimes(2);
    expect(getPendingRestore("a")).toBeNull();
  });

  it("stops notifying after unsubscribe", () => {
    const a = vi.fn();
    const off = subscribePendingRestore("a", a);
    off();
    setPendingRestore("a", block);
    expect(a).not.toHaveBeenCalled();
  });
});

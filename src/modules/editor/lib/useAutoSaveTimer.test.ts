// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { useAutoSaveTimer } from "./useAutoSaveTimer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(autoSave: boolean, autoSaveDelay: number) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: ReturnType<typeof useAutoSaveTimer> | undefined;

  function Harness(props: { autoSave: boolean; autoSaveDelay: number }) {
    latest = useAutoSaveTimer(props.autoSave, props.autoSaveDelay);
    return null;
  }

  act(() => {
    root.render(createElement(Harness, { autoSave, autoSaveDelay }));
  });

  return {
    get hook() {
      if (!latest) throw new Error("hook did not mount");
      return latest;
    },
    unmount: () => act(() => root.unmount()),
  };
}

describe("useAutoSaveTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("does nothing when autoSave is off", () => {
    const h = mount(false, 100);
    const saveNow = vi.fn().mockResolvedValue(undefined);
    act(() => h.hook.scheduleIfDirty(true, saveNow));
    vi.advanceTimersByTime(1000);
    expect(saveNow).not.toHaveBeenCalled();
    h.unmount();
    vi.useRealTimers();
  });

  it("does nothing when the buffer isn't dirty", () => {
    const h = mount(true, 100);
    const saveNow = vi.fn().mockResolvedValue(undefined);
    act(() => h.hook.scheduleIfDirty(false, saveNow));
    vi.advanceTimersByTime(1000);
    expect(saveNow).not.toHaveBeenCalled();
    h.unmount();
    vi.useRealTimers();
  });

  it("calls saveNow after the delay when dirty and autoSave is on", () => {
    const h = mount(true, 100);
    const saveNow = vi.fn().mockResolvedValue(undefined);
    act(() => h.hook.scheduleIfDirty(true, saveNow));
    vi.advanceTimersByTime(99);
    expect(saveNow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(saveNow).toHaveBeenCalledTimes(1);
    h.unmount();
    vi.useRealTimers();
  });

  it("clear() cancels a pending save", () => {
    const h = mount(true, 100);
    const saveNow = vi.fn().mockResolvedValue(undefined);
    act(() => h.hook.scheduleIfDirty(true, saveNow));
    act(() => h.hook.clear());
    vi.advanceTimersByTime(1000);
    expect(saveNow).not.toHaveBeenCalled();
    h.unmount();
    vi.useRealTimers();
  });

  it("a later dirty edit replaces the earlier pending timer", () => {
    const h = mount(true, 100);
    const saveNow = vi.fn().mockResolvedValue(undefined);
    act(() => h.hook.scheduleIfDirty(true, saveNow));
    vi.advanceTimersByTime(50);
    act(() => h.hook.scheduleIfDirty(true, saveNow));
    vi.advanceTimersByTime(50);
    expect(saveNow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(saveNow).toHaveBeenCalledTimes(1);
    h.unmount();
    vi.useRealTimers();
  });
});

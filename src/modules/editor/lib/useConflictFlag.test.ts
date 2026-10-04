// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { useConflictFlag } from "./useConflictFlag";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: ReturnType<typeof useConflictFlag> | undefined;

  function Harness() {
    latest = useConflictFlag();
    return null;
  }

  act(() => {
    root.render(createElement(Harness));
  });

  return {
    get hook() {
      if (!latest) throw new Error("hook did not mount");
      return latest;
    },
    rerender: () => act(() => root.render(createElement(Harness))),
    unmount: () => act(() => root.unmount()),
  };
}

describe("useConflictFlag", () => {
  it("starts clean", () => {
    const h = mount();
    expect(h.hook.conflict).toBe(false);
    h.unmount();
  });

  it("setConflict(true) raises the flag", () => {
    const h = mount();
    act(() => h.hook.setConflict(true));
    expect(h.hook.conflict).toBe(true);
    h.unmount();
  });

  it("keepLocalChanges dismisses the conflict", () => {
    const h = mount();
    act(() => h.hook.setConflict(true));
    act(() => h.hook.keepLocalChanges());
    expect(h.hook.conflict).toBe(false);
    h.unmount();
  });
});

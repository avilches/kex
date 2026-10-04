// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { warning: vi.fn() }) }));

import { toast } from "sonner";
import { useBackgroundConflictToast } from "./useBackgroundConflictToast";

function mount(props: { conflict: boolean; visible: boolean; path: string }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness(p: typeof props) {
    useBackgroundConflictToast(p.conflict, p.visible, p.path);
    return null;
  }

  act(() => {
    root.render(createElement(Harness, props));
  });

  return {
    update: (next: typeof props) => act(() => root.render(createElement(Harness, next))),
    unmount: () => act(() => root.unmount()),
  };
}

describe("useBackgroundConflictToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns when a conflict rises while the tab isn't visible", () => {
    const h = mount({ conflict: false, visible: false, path: "/tmp/a.md" });
    h.update({ conflict: true, visible: false, path: "/tmp/a.md" });
    expect(toast.warning).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it("stays silent when the conflict rises while the tab is visible", () => {
    const h = mount({ conflict: false, visible: true, path: "/tmp/a.md" });
    h.update({ conflict: true, visible: true, path: "/tmp/a.md" });
    expect(toast.warning).not.toHaveBeenCalled();
    h.unmount();
  });

  it("does not repeat the warning while the conflict stays true", () => {
    const h = mount({ conflict: false, visible: false, path: "/tmp/a.md" });
    h.update({ conflict: true, visible: false, path: "/tmp/a.md" });
    h.update({ conflict: true, visible: true, path: "/tmp/a.md" });
    h.update({ conflict: true, visible: false, path: "/tmp/a.md" });
    expect(toast.warning).toHaveBeenCalledTimes(1);
    h.unmount();
  });
});

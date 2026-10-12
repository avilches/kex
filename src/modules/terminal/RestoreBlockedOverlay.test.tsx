// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { retryRestore, cancelRestore } = vi.hoisted(() => ({
  retryRestore: vi.fn(() => Promise.resolve()),
  cancelRestore: vi.fn(() => Promise.resolve()),
}));
vi.mock("./lib/useTerminalSession", () => ({ retryRestore, cancelRestore }));

import { RestoreBlockedOverlay } from "./RestoreBlockedOverlay";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const block = {
  reason: "Directory not found: /mnt/Taxes",
  dir: "/mnt/Taxes",
  command: "claude --resume 'abc'",
  agent: "claude",
};

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<RestoreBlockedOverlay leafId="tab-1" block={block} />));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const button = (c: Element, label: string) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement;

describe("RestoreBlockedOverlay", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows the reason, the directory and the command", () => {
    const { container, unmount } = mount();
    const text = container.textContent ?? "";
    expect(text).toContain("Directory not found: /mnt/Taxes");
    expect(text).toContain("claude --resume 'abc'");
    expect(container.querySelectorAll("code")[0].textContent).toBe("/mnt/Taxes");
    unmount();
  });

  it("Try again retries the leaf", async () => {
    const { container, unmount } = mount();
    await act(async () => button(container, "Try again").click());
    expect(retryRestore).toHaveBeenCalledWith("tab-1");
    expect(cancelRestore).not.toHaveBeenCalled();
    unmount();
  });

  it("Cancel restore cancels the leaf", async () => {
    const { container, unmount } = mount();
    await act(async () => button(container, "Cancel restore").click());
    expect(cancelRestore).toHaveBeenCalledWith("tab-1");
    expect(retryRestore).not.toHaveBeenCalled();
    unmount();
  });
});

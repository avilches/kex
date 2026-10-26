// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { retryRestore, openWithoutRestoring } = vi.hoisted(() => ({
  retryRestore: vi.fn((_id: string) => Promise.resolve()),
  openWithoutRestoring: vi.fn(() => Promise.resolve()),
}));
vi.mock("./lib/useTerminalSession", () => ({ retryRestore, openWithoutRestoring }));

import { RestoreBlockedOverlay } from "./RestoreBlockedOverlay";
import { withRestoreBusy } from "./lib/restoreBusy";
import type { RestoreBlock } from "./lib/restoreStart";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const block = {
  reason: "Folder not found: /mnt/Taxes",
  dir: "/mnt/Taxes",
  command: "claude --resume 'abc'",
  agent: "claude",
  restorable: true,
};

function mount(b: RestoreBlock = block) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<RestoreBlockedOverlay leafId="tab-1" block={b} />));
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
    expect(text).toContain("Folder not found: /mnt/Taxes");
    expect(text).toContain("claude --resume 'abc'");
    expect(container.querySelectorAll("code")[0].textContent).toBe("/mnt/Taxes");
    unmount();
  });

  it("focuses Try again on mount", () => {
    const { container, unmount } = mount();
    expect(document.activeElement).toBe(button(container, "Try again"));
    unmount();
  });

  it("Try again retries the leaf", async () => {
    const { container, unmount } = mount();
    await act(async () => button(container, "Try again").click());
    expect(retryRestore).toHaveBeenCalledWith("tab-1");
    expect(openWithoutRestoring).not.toHaveBeenCalled();
    unmount();
  });

  it("disables both buttons and shows a spinner on Try again while the retry runs, then restores them", async () => {
    let finish!: () => void;
    const work = new Promise<void>((r) => (finish = r));
    retryRestore.mockImplementationOnce((id: string) => withRestoreBusy(id, () => work, 0));
    const { container, unmount } = mount();
    expect(container.querySelector('[role="status"]')).toBeNull();

    await act(async () => button(container, "Try again").click());
    expect(button(container, "Try again").disabled).toBe(true);
    expect(button(container, "Open terminal without restoring").disabled).toBe(true);
    expect(button(container, "Try again").querySelector('[role="status"]')).not.toBeNull();

    await act(async () => {
      finish();
      await work;
    });
    expect(button(container, "Try again").disabled).toBe(false);
    expect(button(container, "Open terminal without restoring").disabled).toBe(false);
    expect(container.querySelector('[role="status"]')).toBeNull();
    unmount();
  });

  it("Open terminal without restoring opens a plain shell and keeps the hint", async () => {
    const { container, unmount } = mount();
    expect(container.textContent).toContain("The restore plan is kept.");
    await act(async () => button(container, "Open terminal without restoring").click());
    expect(openWithoutRestoring).toHaveBeenCalledWith("tab-1");
    expect(retryRestore).not.toHaveBeenCalled();
    unmount();
  });

  it("an open failure offers only Try again and no hint", () => {
    const { container, unmount } = mount({ ...block, restorable: false });
    expect([...container.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Try again"]);
    expect(container.textContent).not.toContain("restore plan is kept");
    unmount();
  });
});

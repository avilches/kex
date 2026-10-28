// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { retryPendingRestore, discardPendingRestore } = vi.hoisted(() => ({
  retryPendingRestore: vi.fn((_id: string) => Promise.resolve()),
  discardPendingRestore: vi.fn((_id: string) => Promise.resolve()),
}));
vi.mock("@/modules/terminal/lib/useTerminalSession", () => ({ retryPendingRestore, discardPendingRestore }));
vi.mock("@/modules/agents/lib/agentSessionRestore", () => ({
  previewResumeCmd: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve(null)) }));

import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { setPendingRestore } from "@/modules/terminal/lib/pendingRestore";
import type { Tab } from "@/modules/workspaces/lib/types";
import { RestoreCommandMenu } from "./RestoreCommandMenu";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const tab = { id: "tab-1", kind: "terminal" } as unknown as Extract<Tab, { kind: "terminal" }>;
const block = {
  reason: "Folder not found: /mnt/Taxes",
  dir: "/mnt/Taxes",
  command: "claude --resume 'abc'",
  agent: "claude",
  restorable: true,
};

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <ContextMenu>
        <ContextMenuTrigger>target</ContextMenuTrigger>
        <ContextMenuContent>
          <RestoreCommandMenu tab={tab} onUpdateTab={vi.fn()} />
        </ContextMenuContent>
      </ContextMenu>,
    ),
  );
  return () => {
    act(() => root.unmount());
    container.remove();
  };
}

// Radix portals the menu: open it with the same event a right click sends.
async function openMenu() {
  const target = document.querySelector('[data-slot="context-menu-trigger"]') as HTMLElement;
  await act(async () => {
    target.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5, button: 2 }),
    );
  });
}

async function openSub() {  const trigger = [...document.querySelectorAll('[data-slot="context-menu-sub-trigger"]')][0] as HTMLElement;
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
  return trigger;
}

const menuItem = (label: string) =>
  [...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent === label) as HTMLElement;

afterEach(() => {
  setPendingRestore("tab-1", null);
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("RestoreCommandMenu pending restore", () => {
  it("shows the pending plan instead of the switch and wires Retry and Discard", async () => {
    setPendingRestore("tab-1", block);
    const unmount = mount();
    await openMenu();
    const trigger = await openSub();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("Enabled");
    expect(text).toContain("Restore pending");
    expect(text).toContain("Folder not found: /mnt/Taxes");
    expect(text).toContain("cd /mnt/Taxes");
    expect(text).toContain("claude --resume 'abc'");
    expect(trigger.className).toContain("text-destructive");
    expect(trigger.className).toContain("data-open:text-destructive");

    const spanWith = (s: string) =>
      [...document.body.querySelectorAll("span")].find((e) => e.textContent === s) as HTMLElement;
    expect(spanWith("Restore pending").className).toContain("text-destructive");
    expect(spanWith("Folder not found: /mnt/Taxes").className).not.toContain("text-destructive");
    const code = document.body.querySelector("code") as HTMLElement;
    expect(code.closest(".text-destructive")).toBeNull();

    await act(async () => menuItem("Retry restore").click());
    expect(retryPendingRestore).toHaveBeenCalledWith("tab-1");
    expect(discardPendingRestore).not.toHaveBeenCalled();
    unmount();
  });

  it("Discard restore plan discards the leaf", async () => {
    setPendingRestore("tab-1", block);
    const unmount = mount();
    await openMenu();
    await openSub();
    await act(async () => menuItem("Discard restore plan").click());
    expect(discardPendingRestore).toHaveBeenCalledWith("tab-1");
    expect(retryPendingRestore).not.toHaveBeenCalled();
    unmount();
  });

  it("shows the Restore Command field, with no Enable or Disable switch, when nothing is pending", async () => {
    const unmount = mount();
    await openMenu();
    await openSub();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Restore Command");
    expect(text).not.toContain("Enable");
    expect(text).not.toContain("Disable");
    expect(text).not.toContain("Run on Start");
    expect(text).not.toContain("Restore pending");
    unmount();
  });
});

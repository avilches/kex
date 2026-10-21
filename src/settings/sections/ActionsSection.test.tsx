// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Action } from "@/modules/actions";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const change = vi.fn(async (fn: (l: Action[]) => Action[]) => ({ before: [] as Action[], after: fn([]) }));
const scan = vi.fn();
let actions: Action[] = [];
let detected = [
  { id: "pycharm", name: "PyCharm", binary: "pycharm", argsBeforePath: [] as string[] },
  { id: "zed", name: "Zed", binary: "zed", argsBeforePath: [] as string[] },
];

vi.mock("@/modules/actions/lib/globalActionsBinding", () => ({ globalActions: { change: (fn: never) => change(fn) } }));
vi.mock("@/modules/external-editors", () => ({
  useExternalEditors: () => ({ detectedEditors: detected, isScanning: false, scan }),
  EditorIcon: () => null,
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (sel: (s: { actions: Action[] }) => unknown) => sel({ actions }),
}));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

const send = vi.fn();
const feed = vi.fn(() => ({ feed: null, send }));
vi.mock("@/modules/actions/lib/actionsFeed", () => ({ useWorkspaceActionsFeed: () => feed() }));

import { ActionsSection } from "./ActionsSection";

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(ActionsSection)));
  return { container, unmount: () => act(() => root.unmount()) };
}

const buttons = (c: HTMLElement) => [...c.querySelectorAll("button")];
const options = () => [...document.querySelectorAll("[cmdk-item]")];

function openApplications(c: HTMLElement) {
  act(() => void buttons(c).find((b) => b.textContent?.includes("Add Application"))!.click());
}

describe("ActionsSection", () => {
  beforeEach(() => {
    change.mockClear();
    toastError.mockClear();
    scan.mockClear();
    actions = [];
    detected = [
      { id: "pycharm", name: "PyCharm", binary: "pycharm", argsBeforePath: [] },
      { id: "zed", name: "Zed", binary: "zed", argsBeforePath: [] },
    ];
  });

  it("creates nothing by itself and does not keep the chip section", () => {
    const { container, unmount } = mount();
    expect(change).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Detected on this computer");
    expect(container.querySelector("button[aria-label='Make global']")).toBeNull();
    unmount();
  });

  it("adds a detected app from the combo through the serialized store", () => {
    const { container, unmount } = mount();
    openApplications(container);
    const item = options().find((o) => o.textContent?.includes("PyCharmWorkspace"));
    act(() => void (item as HTMLElement).click());
    expect(change).toHaveBeenCalledTimes(1);
    const next = change.mock.calls[0]![0]([]);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: "PyCharm {workspace}", appId: "pycharm", runInTerminal: false, ownButton: false });
    unmount();
  });

  it("keeps offering every app, so two actions can share one", () => {
    actions = [{ id: "ac-1", name: "PyCharm {filepath}", runInTerminal: false, command: "pycharm {filepath}", appId: "pycharm", ownButton: false }];
    const { container, unmount } = mount();
    openApplications(container);
    expect(options().some((o) => o.textContent?.includes("PyCharm"))).toBe(true);
    expect(options().some((o) => o.textContent?.includes("Zed"))).toBe(true);
    unmount();
  });

  it("keeps the row being typed, and reports the error, when the write fails", async () => {
    change.mockRejectedValueOnce(new Error("disk full"));
    const { container, unmount } = mount();
    const add = buttons(container).find((b) => b.textContent?.includes("Add Command"))!;
    act(() => void add.click());
    const command = container.querySelector("textarea[aria-label='Command']") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => command.focus());
    act(() => {
      setter.call(command, "pnpm dev");
      command.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => void command.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(toastError).toHaveBeenCalled();
    expect(container.querySelectorAll("textarea[aria-label='Command']")).toHaveLength(1);
    expect((container.querySelector("textarea[aria-label='Command']") as HTMLTextAreaElement).value).toBe("pnpm dev");
    unmount();
  });

  it("scans for apps from the header button", () => {
    const { container, unmount } = mount();
    act(() => void buttons(container).find((b) => b.textContent?.includes("Scan"))!.click());
    expect(scan).toHaveBeenCalled();
    unmount();
  });

  it("installs several presets in one combo session: a pick keeps the combo open", () => {
    const { container, unmount } = mount();
    openApplications(container);
    act(() => void (options().find((o) => o.textContent?.includes("PyCharmWorkspace")) as HTMLElement).click());
    expect(change).toHaveBeenCalledTimes(1);
    expect(options().length).toBeGreaterThan(1);
    act(() => void (options().find((o) => o.textContent?.includes("ZedCurrent File")) as HTMLElement).click());
    expect(change).toHaveBeenCalledTimes(2);
    unmount();
  });
});

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
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { ActionsSection } from "./ActionsSection";

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(ActionsSection)));
  return { container, unmount: () => act(() => root.unmount()) };
}

const buttons = (c: HTMLElement) => [...c.querySelectorAll("button")];

describe("ActionsSection", () => {
  beforeEach(() => {
    change.mockClear();
    scan.mockClear();
    actions = [];
    detected = [
      { id: "pycharm", name: "PyCharm", binary: "pycharm", argsBeforePath: [] },
      { id: "zed", name: "Zed", binary: "zed", argsBeforePath: [] },
    ];
  });

  it("creates nothing by itself: detected apps are only offered", () => {
    const { container, unmount } = mount();
    expect(change).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Detected on this computer");
    expect(container.textContent).toContain("PyCharm");
    unmount();
  });

  it("adds a detected app as an app Action through the serialized store", () => {
    const { container, unmount } = mount();
    const pycharm = buttons(container).find((b) => b.textContent?.includes("PyCharm"))!;
    act(() => void pycharm.click());
    expect(change).toHaveBeenCalledTimes(1);
    const next = change.mock.calls[0]![0]([]);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: "PyCharm", appId: "pycharm", runInTerminal: false, ownButton: false });
    unmount();
  });

  it("stops offering an app that already has an Action", () => {
    actions = [{ id: "ac-1", name: "PyCharm", runInTerminal: false, command: "pycharm {workspace}", appId: "pycharm", ownButton: false }];
    const { container, unmount } = mount();
    const offered = buttons(container).filter((b) => b.title && b.title.includes("{"));
    expect(offered.some((b) => b.textContent?.includes("PyCharm"))).toBe(false);
    expect(offered.some((b) => b.textContent?.includes("Zed"))).toBe(true);
    unmount();
  });

  it("scans for apps from the header button", () => {
    const { container, unmount } = mount();
    act(() => void buttons(container).find((b) => b.textContent?.includes("Scan"))!.click());
    expect(scan).toHaveBeenCalled();
    unmount();
  });

  it("has no Make Global button, since these are already global", () => {
    actions = [{ id: "ac-1", name: "Dev", runInTerminal: true, command: "pnpm dev", cwdMode: "workspace", ownButton: false }];
    const { container, unmount } = mount();
    expect(container.querySelector("button[aria-label='Make global']")).toBeNull();
    unmount();
  });
});

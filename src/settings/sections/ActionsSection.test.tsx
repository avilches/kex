// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Action } from "@/modules/actions";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const change = vi.fn(async (fn: (l: Action[]) => Action[]) => ({ before: [] as Action[], after: fn([]) }));
const scan = vi.fn();
let actions: Action[] = [];
let hydrated = true;
let detected = [
  { id: "pycharm", name: "PyCharm", binary: "pycharm", argsBeforePath: [] as string[] },
  { id: "zed", name: "Zed", binary: "zed", argsBeforePath: [] as string[] },
];

vi.mock("@/modules/actions/lib/globalActionsBinding", () => ({ globalActions: { change: (fn: never) => change(fn) } }));
let agents: { id: string; name: string; binary: string; argsBeforePath: string[]; kind: "agent" }[] = [];

vi.mock("@/modules/external-editors", () => ({
  useExternalEditors: () => ({ detectedEditors: detected, detectedAgents: agents, isScanning: false, scan }),
  EditorIcon: () => null,
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (sel: (s: { actions: Action[]; hydrated: boolean }) => unknown) => sel({ actions, hydrated }),
}));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

const send = vi.fn();
const feed = vi.fn(() => ({ feed: null, send }));
vi.mock("@/modules/actions/lib/actionsFeed", () => ({ useWorkspaceActionsFeed: () => feed() }));

import { ActionsSection, type ActionsRequest } from "./ActionsSection";

function mount(target?: ActionsRequest) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(ActionsSection, { target })));
  return { container, unmount: () => act(() => root.unmount()) };
}

const buttons = (c: HTMLElement) => [...c.querySelectorAll("button")];
const options = () => [...document.querySelectorAll("[cmdk-item]")];

function openAdd(c: HTMLElement) {
  const column = c.querySelector("[data-actions-column='global']")!;
  act(() => void [...column.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add")!.click());
}

const commandField = () => document.querySelector("textarea[aria-label='Command'], textarea[aria-label='Script']") as HTMLTextAreaElement | null;

describe("ActionsSection", () => {
  beforeEach(() => {
    change.mockClear();
    toastError.mockClear();
    scan.mockClear();
    actions = [];
    hydrated = true;
    detected = [
      { id: "pycharm", name: "PyCharm", binary: "pycharm", argsBeforePath: [] },
      { id: "zed", name: "Zed", binary: "zed", argsBeforePath: [] },
    ];
    agents = [];
  });

  it("offers the detected agents in the Add combo and adds one as an agent Action", () => {
    agents = [{ id: "claude", name: "Claude Code", binary: "/usr/local/bin/claude", argsBeforePath: [], kind: "agent" }];
    const { container, unmount } = mount();
    openAdd(container);
    const item = options().find((o) => o.textContent === "Claude CodeWorkspace");
    act(() => void (item as HTMLElement).click());
    const next = change.mock.calls[0]![0]([]);
    expect(next[0]).toMatchObject({ name: "Claude Code", kind: "agent", command: "claude --dangerously-skip-permissions", appId: "claude", cwdMode: "workspace" });
    unmount();
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
    openAdd(container);
    const item = options().find((o) => o.textContent?.includes("PyCharmWorkspace"));
    act(() => void (item as HTMLElement).click());
    expect(change).toHaveBeenCalledTimes(1);
    const next = change.mock.calls[0]![0]([]);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: "PyCharm {workspace}", appId: "pycharm", kind: "app", ownButton: false });
    unmount();
  });

  it("keeps offering every app, so two actions can share one", () => {
    actions = [{ id: "ac-1", name: "PyCharm {filepath}", kind: "app", command: "pycharm {filepath}", appId: "pycharm", ownButton: false }];
    const { container, unmount } = mount();
    openAdd(container);
    expect(options().some((o) => o.textContent?.includes("PyCharm"))).toBe(true);
    expect(options().some((o) => o.textContent?.includes("Zed"))).toBe(true);
    unmount();
  });

  it("keeps the row being typed, and reports the error, when the write fails", async () => {
    change.mockRejectedValueOnce(new Error("disk full"));
    const { container, unmount } = mount();
    openAdd(container);
    act(() => void options()[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const command = commandField()!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => command.focus());
    act(() => {
      setter.call(command, "pnpm dev");
      command.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => command.blur());
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(toastError).toHaveBeenCalled();
    expect(commandField()!.value).toBe("pnpm dev");
    unmount();
  });

  it("starts its own scan only once preferences are hydrated", () => {
    detected = [];
    hydrated = false;
    const first = mount();
    expect(scan).not.toHaveBeenCalled();
    first.unmount();
    hydrated = true;
    const second = mount();
    expect(scan).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it("scans for apps from the header button", () => {
    const { container, unmount } = mount();
    act(() => void buttons(container).find((b) => b.textContent?.includes("Scan"))!.click());
    expect(scan).toHaveBeenCalled();
    unmount();
  });

  it("installs several presets in one combo session: a pick keeps the combo open", () => {
    const { container, unmount } = mount();
    openAdd(container);
    act(() => void (options().find((o) => o.textContent?.includes("PyCharmWorkspace")) as HTMLElement).click());
    expect(change).toHaveBeenCalledTimes(1);
    expect(options().length).toBeGreaterThan(1);
    act(() => void (options().find((o) => o.textContent?.includes("ZedCurrent File")) as HTMLElement).click());
    expect(change).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("shows both columns, and says so when the app reports no workspace", () => {
    const { container, unmount } = mount();
    expect(container.querySelector("[data-actions-column='global']")).not.toBeNull();
    expect(container.querySelector("[data-actions-column='workspace']")!.textContent).toContain("does not report a workspace");
    expect(container.textContent).not.toContain("Current workspace:");
    unmount();
  });

  it("opens the Action a target names in its modal", () => {
    feed.mockReturnValue({
      feed: {
        workspaceId: "ws-1",
        workspaceName: "Dashboard",
        actions: [{ id: "ac-9", name: "Dev", kind: "script", command: "pnpm dev", cwdMode: "workspace", ownButton: false }],
        context: null,
      },
      send,
    } as never);
    const { unmount } = mount({ tab: "workspace", id: "ac-9", nonce: 1 });
    expect(commandField()?.value).toBe("pnpm dev");
    unmount();
    feed.mockReturnValue({ feed: null, send } as never);
  });
});

// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { OwnButton } from "./ActionsBar";
import type { BarItem } from "./lib/actionsBar";
import type { Action } from "./lib/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const script: Action = { id: "s1", name: "dev", runInTerminal: true, command: "pnpm dev", ownButton: true };
const app: Action = { id: "a1", name: "PyCharm", runInTerminal: false, command: "pycharm {workspace}", ownButton: true };

const item = (action: Action, over: Partial<BarItem> = {}): BarItem => ({
  id: action.id,
  name: action.name,
  action,
  state: "idle",
  active: false,
  stoppable: false,
  disabledReason: null,
  subtitle: null,
  ...over,
});

function mount(it: BarItem, focus = vi.fn(() => false)) {
  const handlers = { run: vi.fn(), stop: vi.fn(), focus };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(OwnButton, { item: it, ...handlers })));
  return { container, handlers, unmount: () => act(() => root.unmount()) };
}

const click = (el: Element | null) => act(() => void (el as HTMLElement).click());
const byLabel = (c: HTMLElement, label: string) => c.querySelector(`button[aria-label="${label}"]`);

describe("OwnButton", () => {
  it("gives a script a run zone apart from its name, and the name does not run it when the tab can be focused", () => {
    const { container, handlers, unmount } = mount(item(script, { state: "running", stoppable: true }), vi.fn(() => true));
    const stop = byLabel(container, "Stop dev");
    expect(stop).not.toBeNull();
    const name = [...container.querySelectorAll("button")].find((b) => b.textContent === "dev");
    expect(name).toBeDefined();
    expect(name).not.toBe(stop);
    click(name!);
    expect(handlers.focus).toHaveBeenCalledWith(script);
    expect(handlers.run).not.toHaveBeenCalled();
    click(stop);
    expect(handlers.stop).toHaveBeenCalledWith(script);
    unmount();
  });

  it("runs an idle script from the play zone and from its name", () => {
    const { container, handlers, unmount } = mount(item(script));
    click(byLabel(container, "Run dev"));
    expect(handlers.run).toHaveBeenCalledTimes(1);
    click([...container.querySelectorAll("button")].find((b) => b.textContent === "dev") ?? null);
    expect(handlers.run).toHaveBeenCalledTimes(2);
    expect(handlers.stop).not.toHaveBeenCalled();
    unmount();
  });

  it("has no run or stop zone on an app, and a click launches it", () => {
    const { container, handlers, unmount } = mount(item(app));
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(byLabel(container, "Run PyCharm")).toBeNull();
    expect(byLabel(container, "Stop PyCharm")).toBeNull();
    click(container.querySelector("button"));
    expect(handlers.run).toHaveBeenCalledWith(app);
    expect(handlers.stop).not.toHaveBeenCalled();
    unmount();
  });

  it("disables an Action that cannot run and says why in its title", () => {
    const { container, handlers, unmount } = mount(item(app, { disabledReason: "needs an open file" }));
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain("needs an open file");
    click(button);
    expect(handlers.run).not.toHaveBeenCalled();
    unmount();
  });

  it("keeps a running script stoppable even when its variables are gone", () => {
    const { container, handlers, unmount } = mount(item(script, { state: "running", stoppable: true, disabledReason: null }));
    click(byLabel(container, "Stop dev"));
    expect(handlers.stop).toHaveBeenCalledWith(script);
    unmount();
  });

  it("shows the red stop button again while stopping, and both stops agree", () => {
    const { container, handlers, unmount } = mount(item(script, { state: "waiting", stoppable: true }), vi.fn(() => true));
    const zone = byLabel(container, "Stop dev");
    expect(zone).not.toBeNull();
    expect((zone as HTMLButtonElement).disabled).toBe(false);
    click([...container.querySelectorAll("button")].find((b) => b.textContent === "dev") ?? null);
    expect(handlers.focus).toHaveBeenCalledWith(script);
    expect(handlers.run).not.toHaveBeenCalled();
    click(zone!);
    expect(handlers.stop).toHaveBeenCalledWith(script);
    expect(handlers.run).not.toHaveBeenCalled();
    unmount();
  });
});

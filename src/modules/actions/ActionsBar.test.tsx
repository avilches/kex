// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ActionsMenu, OwnButton } from "./ActionsBar";
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
  subtitleTrim: false,
  title: null,
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

describe("ActionsMenu", () => {
  function mountMenu(items: BarItem[], globalItems: BarItem[], focus = vi.fn(() => false)) {
    const handlers = { run: vi.fn(), stop: vi.fn(), focus };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        createElement(ActionsMenu, {
          label: "Actions",
          items,
          globalItems,
          onRestoreFocus: vi.fn(),
          onConfigure: vi.fn(),
          ...handlers,
        }),
      ),
    );
    const open = () =>
      act(() => {
        const trigger = container.querySelector("button[title='Actions']") as HTMLElement;
        trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, pointerType: "mouse" }));
        trigger.click();
      });
    return { container, handlers, open, unmount: () => act(() => root.unmount()) };
  }

  it("pools every non-own Action into one menu: workspace scope, then global", () => {
    const view = mountMenu([item(app)], [item({ ...script, id: "g1" })]);
    view.open();
    const menu = document.querySelector("[role='menu']")!;
    expect(menu.textContent).toContain("Workspace actions");
    expect(menu.textContent).toContain("Global actions");
    expect([...menu.querySelectorAll("[role='menuitem']")].slice(0, 2).map((r) => r.textContent)).toEqual(["PyCharm", "dev"]);
    view.unmount();
  });

  it("names the scopes only when the combo holds actions of both scopes", () => {
    const view = mountMenu([item(app)], []);
    view.open();
    const menu = document.querySelector("[role='menu']")!;
    expect(menu.textContent).not.toContain("Workspace actions");
    expect(menu.textContent).not.toContain("Global actions");
    expect(menu.textContent).toContain("Action Settings");
    expect(menu.textContent).not.toContain("Configure Actions");
    view.unmount();
    const both = mountMenu([item(app)], [item({ ...script, id: "g1" })]);
    both.open();
    const full = document.querySelector("[role='menu']")!;
    expect(full.textContent).toContain("Workspace actions");
    expect(full.textContent).toContain("Global actions");
    // Even with both scopes, Action Settings comes last with its separator.
    const entries = [...full.querySelectorAll("[role='menuitem']")];
    expect(entries[entries.length - 1]?.textContent).toBe("Action Settings");
    both.unmount();
  });

  it("says where the row opens on its hover title", () => {
    const view = mountMenu([item(app, { title: "Open PyCharm in /w" })], []);
    view.open();
    const row = [...document.querySelectorAll("[role='menu'] [role='menuitem']")].find((r) => r.textContent === "PyCharm") as HTMLElement;
    expect(row.getAttribute("title")).toBe("Open PyCharm in /w");
    view.unmount();
  });

  it("focusing a running script's name does not close the menu, and its play zone still stops", () => {
    const running = item(script, { state: "running", stoppable: true });
    const view = mountMenu([running], [], vi.fn(() => true));
    view.open();
    const row = [...document.querySelectorAll("[role='menu'] [role='menuitem']")].find((r) => r.textContent === "dev") as HTMLElement;
    act(() => void row.click());
    expect(view.handlers.focus).toHaveBeenCalledWith(script);
    expect(view.handlers.run).not.toHaveBeenCalled();
    expect(document.querySelector("[role='menu']")).not.toBeNull();
    const stop = document.querySelector("button[aria-label='Stop dev']") as HTMLElement;
    act(() => void stop.click());
    expect(view.handlers.stop).toHaveBeenCalledWith(script);
    view.unmount();
  });
});

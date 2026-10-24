// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ActionsMenu, OwnButton } from "./ActionsBar";
import type { BarItem } from "./lib/actionsBar";
import type { Action } from "./lib/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const script: Action = { id: "s1", name: "dev", kind: "script", command: "pnpm dev", ownButton: true };
const app: Action = { id: "a1", name: "PyCharm", kind: "app", command: "pycharm {workspace}", ownButton: true };

const item = (action: Action, over: Partial<BarItem> = {}): BarItem => ({
  id: action.id,
  global: false,
  name: action.name,
  action,
  state: "idle",
  active: false,
  stoppable: false,
  disabledReason: null,
  subtitle: null,
  subtitleTrim: false,
  title: null,
  iconOnly: false,
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

  it("spells the variable out on the hover title, never the raw template", () => {
    const named: Action = { ...app, name: "RustRover {cwd}" };
    const open = mount(item(named, { title: "Open RustRover in /p/Kex" }));
    expect(open.container.querySelector("button")?.getAttribute("title")).toBe("Open RustRover in /p/Kex");
    open.unmount();
    const bare = mount(item(named));
    expect(bare.container.querySelector("button")?.getAttribute("title")).toBe("Open RustRover");
    bare.unmount();
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
  function mountMenu(items: BarItem[], globalItems: BarItem[], focus = vi.fn(() => false), extra: { dragging?: boolean; reorderMode?: boolean } = {}) {
    const handlers = { run: vi.fn(), stop: vi.fn(), focus };
    const onEdit = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        createElement(ActionsMenu, {
          label: "Actions",
          items,
          globalItems,
          reorderMode: extra.reorderMode ?? false,
          dragging: extra.dragging ?? false,
          onEdit,
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
    return { container, handlers, onEdit, open, unmount: () => act(() => root.unmount()) };
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

  it("names the scope of each group the combo holds, even when there is only one", () => {
    const view = mountMenu([item(app)], []);
    view.open();
    const menu = document.querySelector("[role='menu']")!;
    expect(menu.textContent).toContain("Workspace actions");
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

  it("a running script's name brings it into view and leaves the menu open, and its play zone still stops", () => {
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

  it("during a drag shows both section titles, empty or not, and says where to drop in the empty one", () => {
    const view = mountMenu([item(app)], [], vi.fn(() => false), { dragging: true });
    view.open();
    const menu = document.querySelector("[role='menu']")!;
    expect(menu.textContent).toContain("Workspace actions");
    expect(menu.textContent).toContain("Global actions");
    expect(menu.textContent).toContain("Drop here");
    view.unmount();
  });

  it("right-click on a row offers Edit Action alone, which opens its card", () => {
    const view = mountMenu([item(app)], []);
    view.open();
    const row = [...document.querySelectorAll("[role='menu'] [role='menuitem']")].find((r) => r.textContent === "PyCharm") as HTMLElement;
    act(() => {
      row.parentElement!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    });
    const entries = [...document.querySelectorAll("[role='menuitem']")].map((e) => e.textContent).filter((t) => t === "Edit Action");
    expect(entries).toEqual(["Edit Action"]);
    expect(document.body.textContent).not.toContain("Delete Action");
    expect(document.body.textContent).not.toContain("Move to");
    act(() => void ([...document.querySelectorAll("[role='menuitem']")].find((e) => e.textContent === "Edit Action") as HTMLElement).click());
    expect(view.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
    view.unmount();
  });

  it("with the reorder modifier held a click on a row does nothing", () => {
    const view = mountMenu([item(script)], [], vi.fn(() => false), { reorderMode: true });
    view.open();
    const row = [...document.querySelectorAll("[role='menu'] [role='menuitem']")].find((r) => r.textContent === "dev") as HTMLElement;
    act(() => void row.click());
    expect(view.handlers.run).not.toHaveBeenCalled();
    view.unmount();
  });

  it("starting an idle script from its name keeps the menu open, while an app closes it", () => {
    const view = mountMenu([item(script)], [item({ ...app, id: "a2" })]);
    view.open();
    const rowOf = (text: string) =>
      [...document.querySelectorAll("[role='menu'] [role='menuitem']")].find((r) => r.textContent === text) as HTMLElement;
    act(() => void rowOf("dev").click());
    expect(view.handlers.run).toHaveBeenCalledWith(script);
    expect(document.querySelector("[role='menu']")).not.toBeNull();
    act(() => void rowOf("PyCharm").click());
    expect(view.handlers.run).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[role='menu']")).toBeNull();
    view.unmount();
  });
});

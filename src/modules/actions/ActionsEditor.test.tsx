// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ActionsEditor } from "./ActionsEditor";
import type { Action } from "./lib/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const saved: Action = { id: "ac-1", name: "Dev", runInTerminal: true, command: "pnpm dev", cwdMode: "workspace", ownButton: false };

function mount(actions: Action[], extra: Partial<Parameters<typeof ActionsEditor>[0]> = {}) {
  const handlers = {
    onAdd: vi.fn(),
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const props = { actions, suggestions: [], context: null, emptyHint: "No actions yet.", ...handlers, ...extra };
  act(() => root.render(createElement(ActionsEditor, props)));
  return { container, ...handlers, unmount: () => act(() => root.unmount()) };
}

function mountWithRerender(actions: Action[]) {
  const handlers = { onAdd: vi.fn(), onUpdate: vi.fn(), onRemove: vi.fn(), onReorder: vi.fn() };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (list: Action[]) =>
    act(() => root.render(createElement(ActionsEditor, { actions: list, suggestions: [], context: null, emptyHint: "No actions yet.", ...handlers })));
  render(actions);
  return { container, ...handlers, rerender: render, unmount: () => act(() => root.unmount()) };
}

const click = (el: Element | null | undefined) => act(() => void (el as HTMLElement).click());
const addButton = (c: HTMLElement) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent?.includes("Add Action"));

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => input.focus());
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => void input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
}

describe("ActionsEditor", () => {
  it("shows the hint when there are no actions", () => {
    const { container, unmount } = mount([]);
    expect(container.textContent).toContain("No actions yet.");
    unmount();
  });

  it("lists the saved actions and hides the hint", () => {
    const { container, unmount } = mount([saved]);
    expect(container.textContent).not.toContain("No actions yet.");
    expect((container.querySelector("input[aria-label='Command']") as HTMLInputElement).value).toBe("pnpm dev");
    unmount();
  });

  it("a new row is a draft that reaches the store only once it has a command", () => {
    const { container, onAdd, unmount } = mount([]);
    click(addButton(container));
    expect(container.querySelectorAll("input[aria-label='Command']")).toHaveLength(1);
    expect(onAdd).not.toHaveBeenCalled();
    type(container.querySelector("input[aria-label='Command']") as HTMLInputElement, "pnpm test");
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ command: "pnpm test", runInTerminal: true });
    unmount();
  });

  it("a draft keeps its row, and its focus, until the store shows it, and is handed over once", () => {
    const { container, onAdd, rerender, unmount } = mountWithRerender([]);
    click(addButton(container));
    const before = container.querySelector("input[aria-label='Command']") as HTMLInputElement;
    type(before, "pnpm test");
    const after = container.querySelector("input[aria-label='Command']") as HTMLInputElement;
    expect(after).toBe(before);
    expect(onAdd).toHaveBeenCalledTimes(1);
    const added = onAdd.mock.calls[0]![0] as Action;
    rerender([added]);
    expect(container.querySelectorAll("input[aria-label='Command']")).toHaveLength(1);
    expect(onAdd).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("a rejected add leaves the row in place so it can be saved again", async () => {
    const onAdd = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const { container, unmount } = mount([], { onAdd });
    click(addButton(container));
    const command = container.querySelector("input[aria-label='Command']") as HTMLInputElement;
    type(command, "pnpm test");
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(container.querySelectorAll("input[aria-label='Command']")).toHaveLength(1);
    type(container.querySelector("input[aria-label='Command']") as HTMLInputElement, "pnpm build");
    expect(onAdd).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("Add Action does not pile up empty drafts", () => {
    const { container, unmount } = mount([]);
    click(addButton(container));
    click(addButton(container));
    expect(container.querySelectorAll("input[aria-label='Command']")).toHaveLength(1);
    unmount();
  });

  it("removing a draft never reaches the store", () => {
    const { container, onRemove, unmount } = mount([]);
    click(addButton(container));
    click(container.querySelector("button[aria-label='Remove action']"));
    expect(onRemove).not.toHaveBeenCalled();
    expect(container.querySelectorAll("input[aria-label='Command']")).toHaveLength(0);
    unmount();
  });

  it("removing a saved action asks the store", () => {
    const { container, onRemove, unmount } = mount([saved]);
    click(container.querySelector("button[aria-label='Remove action']"));
    expect(onRemove).toHaveBeenCalledWith("ac-1");
    unmount();
  });

  it("offers Make global only on saved rows and only when the host passes it", () => {
    const withGlobal = mount([saved], { onMakeGlobal: vi.fn() });
    expect(withGlobal.container.querySelector("button[aria-label='Make global']")).not.toBeNull();
    click(addButton(withGlobal.container));
    expect(withGlobal.container.querySelectorAll("button[aria-label='Make global']")).toHaveLength(1);
    withGlobal.unmount();
    const without = mount([saved]);
    expect(without.container.querySelector("button[aria-label='Make global']")).toBeNull();
    without.unmount();
  });

  it("Make global passes the id of the row", () => {
    const onMakeGlobal = vi.fn();
    const { container, unmount } = mount([saved], { onMakeGlobal });
    click(container.querySelector("button[aria-label='Make global']"));
    expect(onMakeGlobal).toHaveBeenCalledWith("ac-1");
    unmount();
  });

  it("the name box follows the stored name when it changes from outside", () => {
    const first = mount([saved]);
    const name = first.container.querySelector("input[aria-label='Action name']") as HTMLInputElement;
    expect(name.value).toBe("Dev");
    first.unmount();
    const renamed = mount([{ ...saved, name: "Dev server" }]);
    expect((renamed.container.querySelector("input[aria-label='Action name']") as HTMLInputElement).value).toBe("Dev server");
    renamed.unmount();
  });

  it("clearing the name saves nothing and shows the stored name again", () => {
    const { container, onUpdate, unmount } = mount([saved]);
    const input = container.querySelector("input[aria-label='Action name']") as HTMLInputElement;
    type(input, "");
    expect(onUpdate).not.toHaveBeenCalled();
    expect((container.querySelector("input[aria-label='Action name']") as HTMLInputElement).value).toBe("Dev");
    unmount();
  });

  it("a renamed action is saved with the new name", () => {
    const { container, onUpdate, unmount } = mount([saved]);
    type(container.querySelector("input[aria-label='Action name']") as HTMLInputElement, "Server");
    expect(onUpdate).toHaveBeenCalledWith("ac-1", expect.objectContaining({ name: "Server" }));
    unmount();
  });

  it("clearing the command flags it as required and saves nothing", () => {
    const { container, onUpdate, unmount } = mount([saved]);
    const command = container.querySelector("input[aria-label='Command']") as HTMLInputElement;
    act(() => command.focus());
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(command, "");
      command.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Command is required");
    act(() => void command.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onUpdate).not.toHaveBeenCalled();
    expect((container.querySelector("input[aria-label='Command']") as HTMLInputElement).value).toBe("pnpm dev");
    unmount();
  });

  it("saves a command still being typed when the editor goes away", () => {
    const { container, onUpdate, unmount } = mount([saved]);
    const command = container.querySelector("input[aria-label='Command']") as HTMLInputElement;
    act(() => command.focus());
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(command, "pnpm build");
      command.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onUpdate).not.toHaveBeenCalled();
    unmount();
    expect(onUpdate).toHaveBeenCalledWith("ac-1", expect.objectContaining({ command: "pnpm build" }));
  });

  it("a script shows the folder choice and an app does not", () => {
    const script = mount([saved]);
    expect(script.container.textContent).toContain("Run in");
    script.unmount();
    const app = mount([{ id: "ac-2", name: "Zed", runInTerminal: false, command: "zed {path}", ownButton: false }]);
    expect(app.container.textContent).not.toContain("Run in");
    app.unmount();
  });
});

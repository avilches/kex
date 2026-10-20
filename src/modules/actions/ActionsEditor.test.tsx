// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ActionsEditor } from "./ActionsEditor";
import type { AppSuggestion } from "./lib/appSuggestions";
import type { Action } from "./lib/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const saved: Action = { id: "ac-1", name: "Dev", runInTerminal: true, command: "pnpm dev", cwdMode: "workspace", ownButton: false };
const savedApp: Action = { id: "ac-2", name: "Zed", runInTerminal: false, command: "zed {filepath}", ownButton: false };

const zed: AppSuggestion = { key: "zed:workspace", appId: "zed", name: "Zed {workspace}", iconId: "zed", defaultCommand: "zed {workspace}" };
const bbedit: AppSuggestion = { key: "bbedit:path", appId: "bbedit", name: "BBEdit {filepath}", iconId: "bbedit", defaultCommand: "bbedit {filepath}" };

function mount(actions: Action[], extra: Partial<Parameters<typeof ActionsEditor>[0]> = {}) {
  const handlers = {
    onAdd: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const props = {
    actions,
    suggestions: [zed, bbedit],
    context: null,
    emptyHint: "No actions yet.",
    ...handlers,
    ...extra,
  };
  act(() => root.render(createElement(ActionsEditor, props)));
  return { container, ...handlers, unmount: () => act(() => root.unmount()) };
}

function mountWithRerender(actions: Action[]) {
  const handlers = { onAdd: vi.fn().mockResolvedValue(undefined), onUpdate: vi.fn(), onRemove: vi.fn(), onReorder: vi.fn() };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (list: Action[]) =>
    act(() => root.render(createElement(ActionsEditor, { actions: list, suggestions: [], context: null, emptyHint: "No actions yet.", ...handlers })));
  render(actions);
  return { container, ...handlers, rerender: render, unmount: () => act(() => root.unmount()) };
}

const click = (el: Element | null | undefined) => act(() => void (el as HTMLElement)!.click());
const commandButton = (c: HTMLElement) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent?.includes("Add Command"));
const applicationButton = (c: HTMLElement) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent?.includes("Add Application"));
const expand = (c: HTMLElement) => {
  const toggle = c.querySelector("button[aria-label='Expand action']");
  if (toggle) click(toggle);
};
const commandField = (root: HTMLElement | Document) => root.querySelector("textarea[aria-label='Command']") as HTMLTextAreaElement;

function typeField(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => field.focus());
  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => void field.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
}

function dialogButton(text: string) {
  return [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
}

describe("ActionsEditor", () => {
  it("shows the hint and the command examples when there are no actions", () => {
    const { container, unmount } = mount([]);
    expect(container.textContent).toContain("No actions yet.");
    expect(container.textContent).toContain("Command examples:");
    expect(container.textContent).toContain("pnpm dev");
    unmount();
  });

  it("lists saved actions folded to their header, and expands on demand", () => {
    const { container, unmount } = mount([saved]);
    expect(container.textContent).not.toContain("No actions yet.");
    expect(container.textContent).toContain("Dev");
    expect(commandField(container)).toBeNull();
    expand(container);
    expect(commandField(container).value).toBe("pnpm dev");
    unmount();
  });

  it("only one row is open at a time", () => {
    const { container, unmount } = mount([savedApp, saved]);
    expect(container.querySelectorAll("textarea[aria-label='Command']")).toHaveLength(0);
    const lastExpand = () => {
      const list = [...container.querySelectorAll("button[aria-label='Expand action']")];
      return list[list.length - 1] as HTMLElement;
    };
    click(lastExpand());
    expect(container.querySelectorAll("textarea[aria-label='Command']")).toHaveLength(1);
    expect(container.textContent).toContain("Run in");
    click(lastExpand());
    expect(container.querySelectorAll("textarea[aria-label='Command']")).toHaveLength(1);
    expect(container.textContent).not.toContain("Run in");
    unmount();
  });

  it("Add Command starts a script row draft that reaches the store once it has a command", () => {
    const { container, onAdd, unmount } = mount([]);
    click(commandButton(container));
    expect(commandField(container)).not.toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
    typeField(commandField(container), "pnpm test");
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ command: "pnpm test", runInTerminal: true });
    unmount();
  });

  it("a draft keeps its row until the store has not echoed it, while pending", () => {
    const { container, onAdd, unmount } = mountWithRerender([]);
    click(commandButton(container));
    const before = commandField(container);
    typeField(before, "pnpm test");
    expect(commandField(container)).toBe(before);
    expect(onAdd).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("a rejected add leaves the row in place so it can be saved again", async () => {
    const onAdd = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const { container, unmount } = mount([], { onAdd });
    click(commandButton(container));
    typeField(commandField(container), "pnpm test");
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(commandField(container)).not.toBeNull();
    typeField(commandField(container), "pnpm build");
    expect(onAdd).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("Add Command does not pile up empty drafts", () => {
    const { container, unmount } = mount([]);
    click(commandButton(container));
    click(commandButton(container));
    expect(commandField(container)).not.toBeNull();
    expect(container.querySelectorAll("textarea[aria-label='Command']")).toHaveLength(1);
    unmount();
  });

  it("an empty draft is only reused by an add button of the same kind", () => {
    const { container, onAdd, unmount } = mount([]);
    click(commandButton(container));
    click(applicationButton(container));
    click([...document.querySelectorAll("[cmdk-item]")].find((o) => o.textContent?.includes("Custom app"))!);
    expect(container.querySelectorAll("textarea[aria-label='Command']")).toHaveLength(2);
    const [scriptDraft, appDraft] = [...container.querySelectorAll("textarea[aria-label='Command']")] as HTMLTextAreaElement[];
    expect(scriptDraft).not.toBe(appDraft);
    typeField(appDraft, "code {filepath}");
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ runInTerminal: false, command: "code {filepath}" });
    unmount();
  });

  it("an app preset goes straight to the store with its appId and command", () => {
    const { container, onAdd, unmount } = mount([]);
    click(applicationButton(container));
    click([...document.querySelectorAll("[role='option']")].find((o) => o.textContent?.includes("Zed{workspace}")));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0]).toMatchObject({
      name: "Zed {workspace}",
      runInTerminal: false,
      command: "zed {workspace}",
      appId: "zed",
    });
    expect(container.querySelectorAll("textarea[aria-label='Command']")).toHaveLength(0);
    unmount();
  });

  it("the custom application starts an empty app draft instead of the store", () => {
    const { container, onAdd, unmount } = mount([]);
    click(applicationButton(container));
    click([...document.querySelectorAll("[role='option']")].find((o) => o.textContent?.includes("Custom app")));
    expect(onAdd).not.toHaveBeenCalled();
    expect(commandField(container)).not.toBeNull();
    typeField(commandField(container), "code {filepath}");
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ runInTerminal: false, command: "code {filepath}" });
    unmount();
  });

  it("removing asks for confirmation, and a draft never reaches the store", () => {
    const { container, onRemove, unmount } = mount([]);
    click(commandButton(container));
    click(container.querySelector("button[aria-label='Remove action']"));
    expect(dialogButton("Delete")).not.toBeNull();
    click(dialogButton("Cancel"));
    expect(commandField(container)).not.toBeNull();
    expect(onRemove).not.toHaveBeenCalled();
    click(container.querySelector("button[aria-label='Remove action']"));
    click(dialogButton("Delete"));
    expect(onRemove).not.toHaveBeenCalled();
    expect(container.querySelectorAll("textarea[aria-label='Command']")).toHaveLength(0);
    unmount();
  });

  it("a rejected draft does not resurrect when the user confirms removing it", async () => {
    const onAdd = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const { container, unmount } = mount([], { onAdd });
    click(commandButton(container));
    typeField(commandField(container), "pnpm test");
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(onAdd).toHaveBeenCalledTimes(1);
    click(container.querySelector("button[aria-label='Remove action']"));
    click(dialogButton("Delete"));
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("textarea[aria-label='Command']")).toHaveLength(0);
    unmount();
  });

  it("the custom app row exists even with no detected app, exactly once", () => {
    const { container, onAdd, unmount } = mount([], { suggestions: [] });
    click(applicationButton(container));
    const custom = [...document.querySelectorAll("[role='option']")].filter((o) => o.textContent?.includes("Custom app"));
    expect(custom).toHaveLength(1);
    click(custom[0] as HTMLElement);
    expect(onAdd).not.toHaveBeenCalled();
    expect(commandField(container)).not.toBeNull();
    unmount();
  });

  it("removing a saved action reaches the store after the confirmation", () => {
    const { container, onRemove, unmount } = mount([saved]);
    click(container.querySelector("button[aria-label='Remove action']"));
    expect(onRemove).not.toHaveBeenCalled();
    click(dialogButton("Delete"));
    expect(onRemove).toHaveBeenCalledWith("ac-1");
    unmount();
  });

  it("offers Make global only on saved rows and only when the host passes it", () => {
    const withGlobal = mount([saved], { onMakeGlobal: vi.fn() });
    expect(withGlobal.container.querySelector("button[aria-label='Make global']")).not.toBeNull();
    click(commandButton(withGlobal.container));
    expect(withGlobal.container.querySelectorAll("button[aria-label='Make global']")).toHaveLength(1);
    withGlobal.unmount();
    const without = mount([saved]);
    expect(without.container.querySelector("button[aria-label='Make global']")).toBeNull();
    without.unmount();
  });

  it("Make global explains itself and confirms from its popover", () => {
    const onMakeGlobal = vi.fn();
    const { container, unmount } = mount([saved], { onMakeGlobal });
    click(container.querySelector("button[aria-label='Make global']"));
    const content = [...document.querySelectorAll("[role='dialog'], [data-state='open']")].find((n) =>
      n.textContent?.includes("any workspace"),
    );
    expect(content).toBeDefined();
    const confirm = [...document.querySelectorAll("button")].find((b) => b.textContent === "Make global");
    click(confirm);
    expect(onMakeGlobal).toHaveBeenCalledWith("ac-1");
    unmount();
  });

  it("the name field follows the stored name when it changes from outside", () => {
    const first = mount([saved]);
    expand(first.container);
    const name = first.container.querySelector("input[aria-label='Action name']") as HTMLInputElement;
    expect(name.value).toBe("Dev");
    first.unmount();
    const renamed = mount([{ ...saved, name: "Dev server" }]);
    expand(renamed.container);
    expect((renamed.container.querySelector("input[aria-label='Action name']") as HTMLInputElement).value).toBe("Dev server");
    renamed.unmount();
  });

  it("clearing the name saves nothing and shows the stored name again", () => {
    const { container, onUpdate, unmount } = mount([saved]);
    expand(container);
    const input = container.querySelector("input[aria-label='Action name']") as HTMLInputElement;
    typeField(input, "");
    expect(onUpdate).not.toHaveBeenCalled();
    expect((container.querySelector("input[aria-label='Action name']") as HTMLInputElement).value).toBe("Dev");
    unmount();
  });

  it("a renamed action is saved with the new name", () => {
    const { container, onUpdate, unmount } = mount([saved]);
    expand(container);
    typeField(container.querySelector("input[aria-label='Action name']") as HTMLInputElement, "Server");
    expect(onUpdate).toHaveBeenCalledWith("ac-1", expect.objectContaining({ name: "Server" }));
    unmount();
  });

  it("the command is a three-row textarea that flags an empty value and saves nothing", () => {
    const { container, onUpdate, unmount } = mount([saved]);
    expand(container);
    const field = commandField(container) as HTMLTextAreaElement;
    expect(field.getAttribute("rows")).toBe("3");
    act(() => field.focus());
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      setter.call(field, "");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Command is required");
    act(() => void field.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onUpdate).not.toHaveBeenCalled();
    expect((container.querySelector("textarea[aria-label='Command']") as HTMLTextAreaElement).value).toBe("pnpm dev");
    unmount();
  });

  it("saves a command still being typed when the editor goes away", () => {
    const { container, onUpdate, unmount } = mount([saved]);
    expand(container);
    const field = commandField(container) as HTMLTextAreaElement;
    act(() => field.focus());
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      setter.call(field, "pnpm build");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onUpdate).not.toHaveBeenCalled();
    unmount();
    expect(onUpdate).toHaveBeenCalledWith("ac-1", expect.objectContaining({ command: "pnpm build" }));
  });

  it("a script shows the folder choice and an app does not", () => {
    const script = mount([saved]);
    expand(script.container);
    expect(script.container.textContent).toContain("Run in");
    script.unmount();
    const app = mount([savedApp]);
    expand(app.container);
    expect(app.container.textContent).not.toContain("Run in");
    app.unmount();
  });

  it("the own-button flag sits next to the name and collapses to a chip", () => {
    const { container, onUpdate, unmount } = mount([saved]);
    expand(container);
    const checkbox = container.querySelector<HTMLButtonElement>("button[role='checkbox']") as HTMLButtonElement;
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    click(checkbox);
    expect(onUpdate).toHaveBeenCalledWith("ac-1", expect.objectContaining({ ownButton: true }));
    unmount();
    const ownTrue = mount([{ ...saved, ownButton: true }]);
    expect(ownTrue.container.textContent).toContain("Header");
    ownTrue.unmount();
  });
});

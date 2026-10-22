// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionsColumns, type ScopeEditor } from "./ActionsColumns";
import type { AppSuggestion } from "./lib/appSuggestions";
import type { Action } from "./lib/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const saved: Action = { id: "ac-1", name: "Dev", runInTerminal: true, command: "pnpm dev", cwdMode: "workspace", ownButton: false };
const savedApp: Action = { id: "ac-2", name: "Zed", runInTerminal: false, command: "zed {filepath}", ownButton: false };
const preset: Action = { id: "ac-3", name: "Zed {workspace}", runInTerminal: false, command: "zed {workspace}", appId: "zed", ownButton: false };

const zed: AppSuggestion = { key: "zed:workspace", appId: "zed", name: "Zed {workspace}", iconId: "zed", defaultCommand: "zed {workspace}" };
const bbedit: AppSuggestion = { key: "bbedit:path", appId: "bbedit", name: "BBEdit {filepath}", iconId: "bbedit", defaultCommand: "bbedit {filepath}" };

type Handlers = { onAdd: ReturnType<typeof vi.fn>; onUpdate: ReturnType<typeof vi.fn>; onRemove: ReturnType<typeof vi.fn>; onReorder: ReturnType<typeof vi.fn> };

function scope(actions: Action[], over: Partial<ScopeEditor> = {}): ScopeEditor & Handlers {
  return {
    actions,
    context: null,
    available: true,
    onAdd: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
    ...over,
  } as ScopeEditor & Handlers;
}

function mount(
  globalActions: Action[],
  workspaceActions: Action[] = [],
  extra: Partial<Omit<Parameters<typeof ActionsColumns>[0], "global" | "workspace">> & { global?: Partial<ScopeEditor>; workspace?: Partial<ScopeEditor> } = {},
) {
  const g = scope(globalActions, extra.global);
  const w = scope(workspaceActions, extra.workspace);
  const onMove = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = () =>
    act(() =>
      root.render(
        createElement(ActionsColumns, {
          workspaceName: "Dashboard",
          onMove,
          suggestions: extra.suggestions ?? [zed, bbedit],
          focusRequest: extra.focusRequest,
          global: g,
          workspace: w,
        }),
      ),
    );
  render();
  return { container, g, w, onMove, unmount: () => act(() => root.unmount()) };
}

const click = (el: Element | null | undefined) => act(() => void (el as HTMLElement)!.click());
const column = (c: HTMLElement, s: "global" | "workspace") => c.querySelector(`[data-actions-column='${s}']`) as HTMLElement;
const addTrigger = (c: HTMLElement, s: "global" | "workspace") =>
  [...column(c, s).querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add");
const options = () => [...document.querySelectorAll("[cmdk-item]")];
const commandField = () => document.querySelector("textarea[aria-label='Command']") as HTMLTextAreaElement | null;
const nameField = () => document.querySelector("input[aria-label='Action name']") as HTMLInputElement | null;
const dialogButton = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const pencil = (c: HTMLElement, n = 0) => c.querySelectorAll("button[aria-label='Edit action']")[n];
const tick = () =>
  act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });

function typeField(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => field.focus());
  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => field.blur());
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ActionsColumns", () => {
  it("shows both columns, the workspace one named, with a hint for each empty one", () => {
    const { container, unmount } = mount([], []);
    expect(column(container, "global").textContent).toContain("No global actions yet.");
    expect(column(container, "workspace").textContent).toContain("Dashboard");
    expect(column(container, "workspace").textContent).toContain("No actions in this workspace yet.");
    expect(container.textContent).toContain("pnpm dev");
    unmount();
  });

  it("lists scripts before apps in each column with what they point at, and no inline expansion", () => {
    const { container, unmount } = mount([savedApp, saved, { ...saved, id: "ac-9", name: "Fixed", cwdMode: "fixed", cwd: "/srv/app" }], [preset]);
    const global = column(container, "global");
    const text = global.textContent ?? "";
    expect(text.indexOf("Dev")).toBeLessThan(text.indexOf("Zed"));
    expect(text).toContain("Scripts");
    expect(text).toContain("Applications");
    expect(text).toContain("/srv/app");
    expect(column(container, "workspace").textContent).toContain("Workspace");
    expect(container.querySelector("[aria-label='Expand action']")).toBeNull();
    expect(commandField()).toBeNull();
    unmount();
  });

  it("the pencil opens a modal with Run in before the name for a script, and no Run in for an app", () => {
    const script = mount([saved]);
    click(pencil(script.container));
    const runIn = document.querySelector("[aria-label='Run in']")!;
    expect(runIn).not.toBeNull();
    expect(runIn.compareDocumentPosition(nameField()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(commandField()!.value).toBe("pnpm dev");
    click(dialogButton("Close"));
    expect(commandField()).toBeNull();
    script.unmount();
    const app = mount([savedApp]);
    click(pencil(app.container));
    expect(document.querySelector("[aria-label='Run in']")).toBeNull();
    expect(commandField()!.value).toBe("zed {filepath}");
    click(dialogButton("Close"));
    app.unmount();
  });

  it("has one Add combo per column, Add Command first", () => {
    const { container, unmount } = mount([], []);
    expect(column(container, "global").textContent).not.toContain("Add Command");
    click(addTrigger(container, "global"));
    expect(options()[0]!.textContent).toContain("Add Command");
    unmount();
  });

  it("Add Command opens a script draft that reaches its scope's store once it has a command", () => {
    const { container, g, w, unmount } = mount([], []);
    click(addTrigger(container, "workspace"));
    click(options()[0]);
    expect(commandField()).not.toBeNull();
    expect(g.onAdd).not.toHaveBeenCalled();
    typeField(commandField()!, "pnpm test");
    expect(w.onAdd).toHaveBeenCalledTimes(1);
    expect(w.onAdd.mock.calls[0]![0]).toMatchObject({ command: "pnpm test", runInTerminal: true });
    expect(g.onAdd).not.toHaveBeenCalled();
    unmount();
  });

  it("closing a draft that has no command forgets it", () => {
    const { container, g, unmount } = mount([], []);
    click(addTrigger(container, "global"));
    click(options()[0]);
    click(dialogButton("Close"));
    expect(commandField()).toBeNull();
    expect(g.onAdd).not.toHaveBeenCalled();
    unmount();
  });

  it("a rejected add keeps the draft open so it can be saved again", async () => {
    const onAdd = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const { container, unmount } = mount([], [], { global: { onAdd } });
    click(addTrigger(container, "global"));
    click(options()[0]);
    typeField(commandField()!, "pnpm test");
    await tick();
    expect(commandField()).not.toBeNull();
    typeField(commandField()!, "pnpm build");
    expect(onAdd).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("an app preset goes straight to the store with its appId and opens no modal", () => {
    const { container, g, unmount } = mount([], []);
    click(addTrigger(container, "global"));
    click(options().find((o) => o.textContent?.includes("ZedWorkspace")));
    expect(g.onAdd).toHaveBeenCalledTimes(1);
    expect(g.onAdd.mock.calls[0]![0]).toMatchObject({ name: "Zed {workspace}", runInTerminal: false, command: "zed {workspace}", appId: "zed" });
    expect(commandField()).toBeNull();
    unmount();
  });

  it("the custom app starts an empty app draft in the modal", () => {
    const { container, g, unmount } = mount([], [], { suggestions: [] });
    click(addTrigger(container, "global"));
    click(options().find((o) => o.textContent?.includes("Custom app")));
    expect(g.onAdd).not.toHaveBeenCalled();
    expect(document.querySelector("[aria-label='Run in']")).toBeNull();
    typeField(commandField()!, "code {filepath}");
    expect(g.onAdd.mock.calls[0]![0]).toMatchObject({ runInTerminal: false, command: "code {filepath}" });
    unmount();
  });

  it("the combo never offers a preset that is already installed", () => {
    const { container, unmount } = mount([preset], [], { suggestions: [zed] });
    click(addTrigger(container, "global"));
    expect(options().filter((o) => o.textContent?.includes("ZedWorkspace"))).toHaveLength(0);
    unmount();
  });

  it("deleting a user action asks first, a preset asks nothing", () => {
    const user = mount([saved]);
    click(user.container.querySelector("button[aria-label='Remove action']"));
    expect(user.g.onRemove).not.toHaveBeenCalled();
    click(dialogButton("Delete"));
    expect(user.g.onRemove).toHaveBeenCalledWith("ac-1");
    user.unmount();
    const system = mount([preset]);
    click(system.container.querySelector("button[aria-label='Remove action']"));
    expect(system.g.onRemove).toHaveBeenCalledWith("ac-3");
    expect(dialogButton("Delete")).toBeUndefined();
    system.unmount();
  });

  it("a renamed action is saved, and clearing the name saves nothing", () => {
    const { container, g, unmount } = mount([saved]);
    click(pencil(container));
    typeField(nameField()!, "");
    expect(g.onUpdate).not.toHaveBeenCalled();
    expect(nameField()!.value).toBe("Dev");
    typeField(nameField()!, "Server");
    expect(g.onUpdate).toHaveBeenCalledWith("ac-1", expect.objectContaining({ name: "Server" }));
    unmount();
  });

  it("flags an empty command and saves nothing for it", () => {
    const { container, g, unmount } = mount([saved]);
    click(pencil(container));
    const field = commandField()!;
    expect(field.getAttribute("rows")).toBe("3");
    act(() => field.focus());
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      setter.call(field, "");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("Command is required");
    act(() => void field.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(g.onUpdate).not.toHaveBeenCalled();
    expect(commandField()!.value).toBe("pnpm dev");
    unmount();
  });

  it("saves a command still being typed when the modal goes away", () => {
    const { container, g, unmount } = mount([saved]);
    click(pencil(container));
    const field = commandField()!;
    act(() => field.focus());
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      setter.call(field, "pnpm build");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(g.onUpdate).not.toHaveBeenCalled();
    unmount();
    expect(g.onUpdate).toHaveBeenCalledWith("ac-1", expect.objectContaining({ command: "pnpm build" }));
  });

  it("the Button checkbox of a row toggles the flag, and is never disabled", () => {
    const own = (id: string): Action => ({ id, name: id, runInTerminal: true, command: "x", cwdMode: "workspace", ownButton: true });
    const { container, g, unmount } = mount([own("a"), own("b"), own("c"), own("d"), saved]);
    const boxes = [...container.querySelectorAll("button[role='checkbox']")] as HTMLButtonElement[];
    expect(boxes.some((b) => b.disabled)).toBe(false);
    click(boxes[boxes.length - 1]);
    expect(g.onUpdate).toHaveBeenCalledWith("ac-1", expect.objectContaining({ ownButton: true }));
    unmount();
  });

  it("editing a preset is the same modal; a changed command makes it the user's own", () => {
    const { container, g, unmount } = mount([preset]);
    click(pencil(container));
    expect(commandField()!.value).toBe("zed {workspace}");
    expect(commandField()!.readOnly).toBe(false);
    typeField(commandField()!, "zed -n {workspace}");
    expect(g.onUpdate).toHaveBeenCalledTimes(1);
    const [id, next] = g.onUpdate.mock.calls[0]! as [string, Action];
    expect(id).toBe("ac-3");
    expect(next).toMatchObject({ command: "zed -n {workspace}", appId: "" });
    unmount();
  });

  it("toggling Button on a preset keeps it a preset", () => {
    const { container, g, unmount } = mount([preset]);
    click(container.querySelector("button[role='checkbox']"));
    expect(g.onUpdate).toHaveBeenCalledWith("ac-3", expect.objectContaining({ ownButton: true, appId: "zed" }));
    unmount();
  });

  it("says so, and takes no Add, when no workspace is open", () => {
    const { container, unmount } = mount([saved], [], { workspace: { available: false } });
    expect(column(container, "workspace").textContent).toContain("does not report a workspace");
    expect(addTrigger(container, "workspace")).toBeUndefined();
    expect(addTrigger(container, "global")).not.toBeUndefined();
    unmount();
  });

  it("opens the Action a focus request names, in its scope's modal", () => {
    const view = mount([saved], [savedApp], { focusRequest: { scope: "workspace", id: "ac-2", nonce: 1 } });
    expect(commandField()!.value).toBe("zed {filepath}");
    expect(document.body.textContent).toContain("Workspace");
    click(dialogButton("Close"));
    expect(commandField()).toBeNull();
    view.unmount();
  });

  it("opens nothing for a request whose Action is not in the list", () => {
    const view = mount([saved], [], { focusRequest: { scope: "global", id: "ghost", nonce: 1 } });
    expect(commandField()).toBeNull();
    view.unmount();
  });
});

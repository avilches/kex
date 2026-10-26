// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionsColumns, type ScopeEditor } from "./ActionsColumns";
import type { AppSuggestion } from "./lib/appSuggestions";
import type { Action } from "./lib/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const saved: Action = { id: "ac-1", name: "Dev", kind: "script", command: "pnpm dev", cwdMode: "workspace", ownButton: false };
const savedApp: Action = { id: "ac-2", name: "Zed", kind: "app", command: "zed {filepath}", ownButton: false };
const preset: Action = { id: "ac-3", name: "Zed {workspace}", kind: "app", command: "zed {workspace}", appId: "zed", ownButton: false };

const zed: AppSuggestion = { key: "zed:workspace", appId: "zed", name: "Zed {workspace}", iconId: "zed", defaultCommand: "zed {workspace}", kind: "app" };
const bbedit: AppSuggestion = { key: "bbedit:path", appId: "bbedit", name: "BBEdit {filepath}", iconId: "bbedit", defaultCommand: "bbedit {filepath}", kind: "app" };
const claudeWs: AppSuggestion = { key: "claude:workspace", appId: "claude", name: "Claude Code", iconId: "claude", defaultCommand: "claude", kind: "agent", cwdMode: "workspace" };
const claudeCtx: AppSuggestion = { ...claudeWs, key: "claude:context", cwdMode: "context" };

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
const commandField = () => document.querySelector("textarea[aria-label='Command'], textarea[aria-label='Script']") as HTMLTextAreaElement | null;
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

  it("the pencil opens a modal with Run in folder before the name for a script, and no Run in for an app", () => {
    const script = mount([saved]);
    click(pencil(script.container));
    const runIn = document.querySelector("[aria-label='Run in folder']")!;
    expect(runIn).not.toBeNull();
    expect(runIn.compareDocumentPosition(nameField()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(commandField()!.value).toBe("pnpm dev");
    click(dialogButton("Done"));
    expect(commandField()).toBeNull();
    script.unmount();
    const app = mount([savedApp]);
    click(pencil(app.container));
    expect(document.querySelector("[aria-label='Run in folder']")).toBeNull();
    expect(commandField()!.value).toBe("zed {filepath}");
    click(dialogButton("Done"));
    app.unmount();
  });

  it("has one Add combo per column, Add script first", () => {
    const { container, unmount } = mount([], []);
    expect(column(container, "global").textContent).not.toContain("Add script");
    click(addTrigger(container, "global"));
    expect(options()[0]!.textContent).toContain("Add script");
    unmount();
  });

  it("Add script opens a script draft that reaches its scope's store once it has a command", () => {
    const { container, g, w, unmount } = mount([], []);
    click(addTrigger(container, "workspace"));
    click(options()[0]);
    expect(commandField()).not.toBeNull();
    expect(g.onAdd).not.toHaveBeenCalled();
    typeField(commandField()!, "pnpm test");
    expect(w.onAdd).toHaveBeenCalledTimes(1);
    expect(w.onAdd.mock.calls[0]![0]).toMatchObject({ command: "pnpm test", kind: "script" });
    expect(g.onAdd).not.toHaveBeenCalled();
    unmount();
  });

  it("closing a draft that has no command forgets it", () => {
    const { container, g, unmount } = mount([], []);
    click(addTrigger(container, "global"));
    click(options()[0]);
    click(dialogButton("Done"));
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
    click(options().find((o) => o.textContent?.includes("ZedWorkspace root")));
    expect(g.onAdd).toHaveBeenCalledTimes(1);
    expect(g.onAdd.mock.calls[0]![0]).toMatchObject({ name: "Zed {workspace}", kind: "app", command: "zed {workspace}", appId: "zed" });
    expect(commandField()).toBeNull();
    unmount();
  });

  it("the custom app starts an empty app draft in the modal", () => {
    const { container, g, unmount } = mount([], [], { suggestions: [] });
    click(addTrigger(container, "global"));
    click(options().find((o) => o.textContent?.includes("Custom")));
    expect(g.onAdd).not.toHaveBeenCalled();
    expect(document.querySelector("[aria-label='Run in folder']")).toBeNull();
    typeField(commandField()!, "code {filepath}");
    expect(g.onAdd.mock.calls[0]![0]).toMatchObject({ kind: "app", command: "code {filepath}" });
    unmount();
  });

  it("lists agents, scripts and apps in three groups of each column", () => {
    const agent: Action = { id: "ac-g", name: "Claude Code", kind: "agent", command: "claude", appId: "claude", cwdMode: "context", ownButton: true };
    const { container, unmount } = mount([agent, savedApp, saved]);
    const text = column(container, "global").textContent ?? "";
    expect(text.indexOf("Agents")).toBeLessThan(text.indexOf("Scripts"));
    expect(text.indexOf("Scripts")).toBeLessThan(text.indexOf("Applications"));
    expect(text.indexOf("Agents")).toBeLessThan(text.indexOf("Claude Code"));
    expect(text.indexOf("Claude Code")).toBeLessThan(text.indexOf("Scripts"));
    expect(text.indexOf("Applications")).toBeLessThan(text.indexOf("Zed"));
    expect(text).toContain("Current folder");
    unmount();
  });

  it("an agent preset goes straight to the store as an agent with its start folder", () => {
    const { container, g, unmount } = mount([], [], { suggestions: [claudeWs, claudeCtx] });
    click(addTrigger(container, "global"));
    const entries = options().filter((o) => o.textContent?.startsWith("Claude Code"));
    expect(entries.map((o) => o.textContent)).toEqual(["Claude CodeWorkspace root", "Claude CodeCurrent folder"]);
    click(entries[1]);
    expect(g.onAdd.mock.calls[0]![0]).toMatchObject({
      name: "Claude Code",
      kind: "agent",
      command: "claude",
      appId: "claude",
      cwdMode: "context",
    });
    expect(commandField()).toBeNull();
    unmount();
  });

  it("the modal of an agent has Run in folder, name and command, and no variables", () => {
    const agent: Action = { id: "ac-g", name: "Claude Code", kind: "agent", command: "claude {x}", appId: "claude", cwdMode: "workspace", ownButton: true };
    const { container, unmount } = mount([agent]);
    click(pencil(container));
    expect(document.querySelector("[role='dialog']")?.textContent).toContain("Edit agent");
    expect(document.querySelector("[aria-label='Run in folder']")).not.toBeNull();
    expect(nameField()!.value).toBe("Claude Code");
    expect(commandField()!.value).toBe("claude {x}");
    expect(dialogButton("Show variables")).toBeUndefined();
    expect(document.querySelector("[role='dialog']")?.textContent).not.toMatch(/has no value|Stop/);
    click(dialogButton("Done"));
    unmount();
  });

  describe("the Yolo checkbox of an agent", () => {
    const agentOf = (command: string, over: Partial<Action> = {}): Action => ({
      id: "ac-y",
      name: "Agent",
      kind: "agent",
      command,
      cwdMode: "workspace",
      ownButton: true,
      ...over,
    });
    const yoloBox = () => document.querySelector("button[role='checkbox']#action-yolo") as HTMLElement | null;

    it("is unchecked on a bare known agent and appends the switch when checked", () => {
      const { container, g, unmount } = mount([agentOf("claude -c")]);
      click(pencil(container));
      expect(yoloBox()?.getAttribute("aria-checked")).toBe("false");
      click(yoloBox());
      const [id, next] = g.onUpdate.mock.calls[0]! as [string, Action];
      expect(id).toBe("ac-y");
      expect(next.command).toBe("claude -c --dangerously-skip-permissions");
      unmount();
    });

    it("is checked when the switch is anywhere in the command and removes it when unchecked", () => {
      const { container, g, unmount } = mount([agentOf("claude --dangerously-skip-permissions -c")]);
      click(pencil(container));
      expect(yoloBox()?.getAttribute("aria-checked")).toBe("true");
      click(yoloBox());
      const [, next] = g.onUpdate.mock.calls[0]! as [string, Action];
      expect(next.command).toBe("claude -c");
      unmount();
    });

    it("names the switch it manages", () => {
      const { container, unmount } = mount([agentOf("grok")]);
      click(pencil(container));
      expect(document.querySelector("[role='dialog']")?.textContent).toContain("--permission-mode bypassPermissions");
      unmount();
    });

    it("is absent for an agent without a switch and for scripts and apps", () => {
      for (const action of [agentOf("pi"), saved, savedApp]) {
        const { container, unmount } = mount([action]);
        click(pencil(container));
        expect(yoloBox()).toBeNull();
        click(dialogButton("Done"));
        unmount();
      }
    });
  });

  it("the combo never offers a preset that is already installed", () => {
    const { container, unmount } = mount([preset], [], { suggestions: [zed] });
    click(addTrigger(container, "global"));
    expect(options().filter((o) => o.textContent?.includes("ZedWorkspace root"))).toHaveLength(0);
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

  it("Enter in the name field saves what is typed and closes the modal", () => {
    const { container, g, unmount } = mount([saved]);
    click(pencil(container));
    act(() => nameField()!.focus());
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(nameField()!, "Server");
      nameField()!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(g.onUpdate).not.toHaveBeenCalled();
    act(() => nameField()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(nameField()).toBeNull();
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
    expect(document.body.textContent).toContain("Script is required");
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

  it("editing a preset is the same modal; a changed command makes it the user's own", () => {
    const { container, g, unmount } = mount([preset]);
    click(pencil(container));
    expect(commandField()!.value).toBe("zed {workspace}");
    expect(commandField()!.readOnly).toBe(false);
    typeField(commandField()!, "zed -n {workspace}");
    expect(g.onUpdate).toHaveBeenCalledTimes(1);
    const [id, next] = g.onUpdate.mock.calls[0]! as [string, Action];
    expect(id).toBe("ac-3");
    expect(next).toMatchObject({ command: "zed -n {workspace}", appId: "", iconId: "zed" });
    unmount();
  });

  it("rows carry no Button checkbox, and a double click on the body opens the modal", () => {
    const { container, unmount } = mount([saved]);
    expect(container.querySelector("button[role='checkbox']")).toBeNull();
    act(() => void container.querySelector("[data-action-row] .truncate")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(commandField()!.value).toBe("pnpm dev");
    unmount();
  });

  it("a double click on a row button does not open the modal", () => {
    const { container, unmount } = mount([preset]);
    act(() => void container.querySelector("button[aria-label='Remove action']")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(commandField()).toBeNull();
    unmount();
  });

  it("names the second column This workspace, with the workspace name under it", () => {
    const { container, unmount } = mount([], []);
    const workspace = column(container, "workspace").textContent ?? "";
    expect(workspace).toContain("This workspace");
    expect(workspace).toContain("Dashboard");
    unmount();
  });

  it("the modal chooses own button or combo with a radio and shows how it will look", () => {
    const view = mount([saved]);
    click(pencil(view.container));
    const preview = () => document.querySelector("[data-own-button-preview]")!.getAttribute("data-own-button-preview");
    expect(preview()).toBe("combo");
    click(document.querySelector("[aria-label='Where it shows in the header'] [role='radio'][value='button']"));
    expect(view.g.onUpdate).toHaveBeenCalledWith("ac-1", expect.objectContaining({ ownButton: true }));
    view.unmount();
    const own = mount([{ ...saved, ownButton: true }]);
    click(pencil(own.container));
    expect(preview()).toBe("button");
    own.unmount();
  });

  it("the scope choice is two small buttons, This workspace first, with the hints on hover", () => {
    const { container, unmount } = mount([saved], []);
    click(pencil(container));
    const group = document.querySelector("[aria-label='Where it is available']")!;
    const buttons = [...group.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["This workspace", "Global"]);
    expect(buttons.map((b) => b.getAttribute("title"))).toEqual(["Dashboard", "every workspace"]);
    unmount();
  });

  it("the preview keeps the Actions combo, and the open one has its group title and the line under the name", () => {
    const combo = mount([saved], [savedApp]);
    click(pencil(combo.container, 1));
    const preview = () => document.querySelector("[data-own-button-preview]")!;
    expect(preview().querySelector("[data-preview-combo]")).not.toBeNull();
    expect(preview().textContent).toContain("Global actions");
    expect(preview().textContent).toContain("Dev");
    expect(preview().textContent).toContain("Workspace");
    click(dialogButton("Done"));
    combo.unmount();
    const button = mount([{ ...saved, ownButton: true }]);
    click(pencil(button.container));
    expect(preview().querySelector("[data-preview-combo]")).not.toBeNull();
    expect(preview().textContent).not.toContain("Global actions");
    button.unmount();
  });

  it("the modal scope radio moves a saved Action to the other scope and stays open", () => {
    const { container, onMove, unmount } = mount([saved], []);
    click(pencil(container));
    click(document.querySelector("[aria-label='Where it is available'] [role='radio'][value='workspace']"));
    expect(onMove).toHaveBeenCalledWith("global", "workspace", "ac-1");
    expect(commandField()!.value).toBe("pnpm dev");
    unmount();
  });

  it("the scope radio of a new draft only changes where it will be added", () => {
    const { container, g, w, onMove, unmount } = mount([], []);
    click(addTrigger(container, "global"));
    click(options()[0]);
    click(document.querySelector("[aria-label='Where it is available'] [role='radio'][value='workspace']"));
    expect(onMove).not.toHaveBeenCalled();
    typeField(commandField()!, "pnpm test");
    expect(g.onAdd).not.toHaveBeenCalled();
    expect(w.onAdd).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("offers no workspace in the scope radio when no workspace is open", () => {
    const { container, unmount } = mount([saved], [], { workspace: { available: false } });
    click(pencil(container));
    const radio = document.querySelector("[aria-label='Where it is available'] [role='radio'][value='workspace']") as HTMLButtonElement;
    expect(radio.disabled).toBe(true);
    unmount();
  });

  it("a new command runs in Home unless told otherwise, and the folder choice says so", () => {
    const { container, g, unmount } = mount([], []);
    click(addTrigger(container, "global"));
    click(options()[0]);
    expect(document.querySelector("[aria-label='Run in folder']")!.textContent).toContain("Home");
    typeField(commandField()!, "pnpm test");
    expect(g.onAdd.mock.calls[0]![0]).toMatchObject({ cwdMode: "home" });
    unmount();
  });

  it("editing the command back to the preset's gives the preset back, whatever the name", () => {
    const own: Action = { id: "ac-4", name: "My Zed", kind: "app", command: "zed -n {workspace}", iconId: "zed", ownButton: false };
    const { container, g, unmount } = mount([own]);
    click(pencil(container));
    typeField(commandField()!, "zed {workspace}");
    expect(g.onUpdate).toHaveBeenCalledWith("ac-4", expect.objectContaining({ command: "zed {workspace}", appId: "zed", iconId: "" }));
    unmount();
  });

  it("an app whose command is a detected preset's is deleted without asking, even with no appId", () => {
    const own: Action = { id: "ac-4", name: "My Zed", kind: "app", command: "zed {workspace}", iconId: "zed", ownButton: false };
    const { container, g, unmount } = mount([own]);
    click(container.querySelector("button[aria-label='Remove action']"));
    expect(g.onRemove).toHaveBeenCalledWith("ac-4");
    expect(dialogButton("Delete")).toBeUndefined();
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
    expect(document.body.textContent).toContain("This workspace");
    click(dialogButton("Done"));
    expect(commandField()).toBeNull();
    view.unmount();
  });

  it("opens nothing for a request whose Action is not in the list", () => {
    const view = mount([saved], [], { focusRequest: { scope: "global", id: "ghost", nonce: 1 } });
    expect(commandField()).toBeNull();
    view.unmount();
  });
});

describe("ActionsColumns scope switch with lagging stores", () => {
  function harness(initialGlobal: Action[], initialWorkspace: Action[]) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onMove = vi.fn();
    const show = (g: Action[], w: Action[]) =>
      act(() =>
        root.render(
          createElement(ActionsColumns, {
            workspaceName: "Dashboard",
            onMove,
            suggestions: [],
            global: scope(g),
            workspace: scope(w),
          }),
        ),
      );
    show(initialGlobal, initialWorkspace);
    return { container, show, onMove, unmount: () => act(() => root.unmount()) };
  }
  const radio = (v: string) => document.querySelector(`[aria-label='Where it is available'] [role='radio'][value='${v}']`);

  it("keeps the modal open while the Action is in neither list, then lands in the new scope", () => {
    const h = harness([saved], []);
    click(pencil(h.container));
    click(radio("workspace"));
    h.show([], []);
    expect(commandField()?.value).toBe("pnpm dev");
    h.show([], [saved]);
    expect(commandField()?.value).toBe("pnpm dev");
    h.unmount();
  });

  it("keeps the modal open when the Action lands in the new scope before leaving the old one", () => {
    const h = harness([saved], []);
    click(pencil(h.container));
    click(radio("workspace"));
    h.show([saved], [saved]);
    expect(commandField()?.value).toBe("pnpm dev");
    h.show([], [saved]);
    expect(commandField()?.value).toBe("pnpm dev");
    h.unmount();
  });

  it("keeps the modal open when a stale list drops the Action after it landed in the new scope", () => {
    const h = harness([saved], []);
    click(pencil(h.container));
    click(radio("workspace"));
    h.show([], [saved]);
    h.show([], []);
    expect(commandField()?.value).toBe("pnpm dev");
    h.show([], [saved]);
    expect(commandField()?.value).toBe("pnpm dev");
    h.unmount();
  });

  it("keeps the modal open when the move changes the Action id (merged twin)", () => {
    const h = harness([savedApp], [{ ...savedApp, id: "ac-9" }]);
    click(pencil(h.container));
    click(radio("workspace"));
    h.show([], [{ ...savedApp, id: "ac-9" }]);
    expect(commandField()?.value).toBe("zed {filepath}");
    h.unmount();
  });
});

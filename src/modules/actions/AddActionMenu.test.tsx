// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AddActionMenu } from "./AddActionMenu";
import { uninstalledSuggestions, type AppSuggestion } from "./lib/appSuggestions";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const suggestions: AppSuggestion[] = [
  { key: "zed:app", appId: "zed", name: "Zed", iconId: "zed", defaultCommand: "zed {target}", kind: "app", accepts: "both" },
  { key: "pycharm:app", appId: "pycharm", name: "PyCharm", iconId: "pycharm", defaultCommand: "pycharm {target}", kind: "app", accepts: "folder" },
  { key: "bbedit:app", appId: "bbedit", name: "BBEdit", iconId: "bbedit", defaultCommand: "bbedit {target}", kind: "app", accepts: "file" },
];

function mount(actions: readonly AppSuggestion[] = suggestions) {
  const onAddCommand = vi.fn();
  const onAddAgent = vi.fn();
  const onPickApp = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(AddActionMenu, { suggestions: actions as AppSuggestion[], onAddCommand, onAddAgent, onPickApp })));
  const options = () => [...document.querySelectorAll("[cmdk-item]")];
  return {
    container,
    onAddCommand,
    onAddAgent,
    onPickApp,
    options,
    trigger: [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Add"))!,
    unmount: () => act(() => root.unmount()),
  };
}

const click = (el: Element) => act(() => void (el as HTMLElement).click());

function search(text: string) {
  const box = document.querySelector<HTMLInputElement>("input[placeholder='Search...']")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("AddActionMenu", () => {
  it("lists Add script first, Custom agent, Custom, then one entry per preset with its icon", () => {
    const view = mount();
    click(view.trigger);
    expect(view.options().map((o) => o.textContent)).toEqual([
      "Add scriptruns in a terminal",
      "Custom agentyour own command",
      "Custom",
      "BBEditFiles",
      "PyCharmFolders",
      "ZedFiles and folders",
    ]);
    view.unmount();
  });

  it("offers each app once, whatever it takes, and says on its hover what it opens", () => {
    const view = mount();
    click(view.trigger);
    const titleOf = (text: string) => (view.options().find((o) => o.textContent === text) as HTMLElement).getAttribute("title");
    expect(titleOf("ZedFiles and folders")).toBe("Open files and folders with Zed");
    expect(titleOf("PyCharmFolders")).toBe("Open folders with PyCharm");
    expect(titleOf("BBEditFiles")).toBe("Open files with BBEdit");
    expect(view.options().filter((o) => o.textContent?.startsWith("Zed"))).toHaveLength(1);
    view.unmount();
  });

  it("filters the entries from the search box, Add script included", () => {
    const view = mount();
    click(view.trigger);
    search("pycharm");
    expect(view.options().map((o) => o.textContent)).toEqual(["PyCharmFolders"]);
    search("script");
    expect(view.options().map((o) => o.textContent)).toEqual(["Add scriptruns in a terminal"]);
    view.unmount();
  });

  it("Add script closes the combo and asks for a script", () => {
    const view = mount();
    click(view.trigger);
    click(view.options()[0]!);
    expect(view.onAddCommand).toHaveBeenCalledTimes(1);
    expect(view.options()).toHaveLength(0);
    view.unmount();
  });

  it("Custom agent closes the combo and asks for an agent draft, even with every detected agent installed", () => {
    const view = mount([]);
    click(view.trigger);
    expect(view.options().map((o) => o.textContent)).toContain("Custom agentyour own command");
    click(view.options().find((o) => o.textContent?.includes("Custom agent"))!);
    expect(view.onAddAgent).toHaveBeenCalledTimes(1);
    expect(view.onAddCommand).not.toHaveBeenCalled();
    expect(view.options()).toHaveLength(0);
    view.unmount();
  });

  it("finds Custom agent from the search box by agent or custom", () => {
    const view = mount();
    click(view.trigger);
    search("custom");
    expect(view.options().map((o) => o.textContent)).toEqual(["Custom agentyour own command", "Custom"]);
    view.unmount();
  });

  it("picking a preset hands it over and stays open for the next one", () => {
    const view = mount();
    click(view.trigger);
    click(view.options().find((o) => o.textContent === "ZedFiles and folders")!);
    expect(view.onPickApp).toHaveBeenCalledTimes(1);
    expect(view.onPickApp).toHaveBeenCalledWith(suggestions[0]);
    expect(view.options()).toHaveLength(6);
    view.unmount();
  });

  it("offers one entry per detected agent in its own section, after Custom agent", () => {
    const claude: AppSuggestion = { key: "claude:agent", appId: "claude", name: "Claude Code", iconId: "claude", defaultCommand: "claude", kind: "agent" };
    const view = mount([...suggestions, claude]);
    click(view.trigger);
    const groups = [...document.querySelectorAll("[cmdk-group]")];
    const agents = groups.find((g) => g.querySelector("[cmdk-group-heading]")?.textContent === "Agents")!;
    expect([...agents.querySelectorAll("[cmdk-item]")].map((o) => o.textContent)).toEqual([
      "Custom agentyour own command",
      "Claude CodeWorkspace root",
    ]);
    const apps = groups.find((g) => g.querySelector("[cmdk-group-heading]")?.textContent === "Applications")!;
    expect(apps.textContent).not.toContain("Claude");
    click(agents.querySelectorAll("[cmdk-item]")[1]!);
    expect(view.onPickApp).toHaveBeenCalledWith(claude);
    view.unmount();
  });

  it("orders the combo as Add script, then the Agents group, then the Applications", () => {
    const claude: AppSuggestion = { key: "claude:agent", appId: "claude", name: "Claude Code", iconId: "claude", defaultCommand: "claude", kind: "agent" };
    const view = mount([...suggestions, claude]);
    click(view.trigger);
    expect(view.options().map((o) => o.textContent)).toEqual([
      "Add scriptruns in a terminal",
      "Custom agentyour own command",
      "Claude CodeWorkspace root",
      "Custom",
      "BBEditFiles",
      "PyCharmFolders",
      "ZedFiles and folders",
    ]);
    view.unmount();
  });

  it("shows an empty state when nothing matches", () => {
    const view = mount();
    click(view.trigger);
    search("nothing here");
    expect(document.body.textContent).toContain("Nothing found.");
    view.unmount();
  });
});

describe("uninstalledSuggestions", () => {
  it("keeps presets no action uses yet", () => {
    expect(uninstalledSuggestions(suggestions, [])).toEqual(suggestions);
  });

  it("hides a preset an app already has by its command, whatever its name, icon or appId", () => {
    const installed = [{ id: "ac-1", name: "Zed", kind: "app" as const, command: "zed {target}", appId: "zed", ownButton: false }];
    expect(uninstalledSuggestions(suggestions, installed).map((s) => s.key)).toEqual(["pycharm:app", "bbedit:app"]);
    expect(uninstalledSuggestions(suggestions, [{ ...installed[0], appId: undefined, name: "Mine" }]).map((s) => s.key)).toEqual(["pycharm:app", "bbedit:app"]);
    expect(uninstalledSuggestions(suggestions, [{ ...installed[0], command: " zed {target}  " }]).map((s) => s.key)).toEqual(["pycharm:app", "bbedit:app"]);
  });

  it("hides nothing for a different command, nor for a script that has the command", () => {
    const installed = [{ id: "ac-1", name: "Zed", kind: "app" as const, command: "zed -n {target}", appId: "zed", ownButton: false }];
    expect(uninstalledSuggestions(suggestions, installed)).toEqual(suggestions);
    expect(uninstalledSuggestions(suggestions, [{ ...installed[0], command: "zed {target}", kind: "script" }])).toEqual(suggestions);
  });
});

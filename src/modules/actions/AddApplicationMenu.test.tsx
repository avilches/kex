// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AddApplicationMenu } from "./AddApplicationMenu";
import { uninstalledSuggestions, type AppSuggestion } from "./lib/appSuggestions";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const suggestions: AppSuggestion[] = [
  { key: "zed:path", appId: "zed", name: "Zed {filepath}", iconId: "zed", defaultCommand: "zed {filepath}" },
  { key: "zed:workspace", appId: "zed", name: "Zed {workspace}", iconId: "zed", defaultCommand: "zed {workspace}" },
  { key: "bbedit:path", appId: "bbedit", name: "BBEdit {filepath}", iconId: "bbedit", defaultCommand: "bbedit {filepath}" },
];

function mount(actions: readonly AppSuggestion[] = suggestions) {
  const onPick = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(AddApplicationMenu, { suggestions: actions as AppSuggestion[], onPick })));
  const options = () => [...document.querySelectorAll("[cmdk-item]")];
  return {
    container,
    onPick,
    options,
    trigger: [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Add Application"))!,
    unmount: () => act(() => root.unmount()),
  };
}

const click = (el: Element) => act(() => void (el as HTMLElement).click());

describe("AddApplicationMenu", () => {
  it("opens the searchable combo with one entry per preset, each with its icon", () => {
    const view = mount();
    click(view.trigger);
    expect(view.options().map((o) => o.textContent)).toEqual([
      "BBEditCurrent File",
      "ZedCurrent File",
      "ZedWorkspace",
      "Custom appwrite the command yourself",
    ]);
    view.unmount();
  });

  it("tells the place of each preset on its hover title", () => {
    const view = mount();
    click(view.trigger);
    const row = view.options().find((o) => o.textContent?.includes("ZedWorkspace")) as HTMLElement;
    expect(row.getAttribute("title")).toBe("Open Zed in Workspace");
    const fileRow = view.options().find((o) => o.textContent?.includes("ZedCurrent File")) as HTMLElement;
    expect(fileRow.getAttribute("title")).toBe("Open Current File with Zed");
    view.unmount();
  });

  it("filters the entries from the search box", () => {
    const view = mount();
    click(view.trigger);
    const search = document.querySelector<HTMLInputElement>("input[placeholder='Search applications...']")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(search, "workspace");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view.options().map((o) => o.textContent)).toEqual(["ZedWorkspace"]);
    view.unmount();
  });

  it("picking a preset hands it over and stays open for the next one", () => {
    const view = mount();
    click(view.trigger);
    click(view.options().find((o) => o.textContent?.includes("ZedWorkspace"))!);
    expect(view.onPick).toHaveBeenCalledTimes(1);
    expect(view.onPick).toHaveBeenCalledWith(suggestions[1]);
    expect(view.options()).toHaveLength(4);
    view.unmount();
  });

  it("picking nothing found shows an empty state", () => {
    const view = mount();
    click(view.trigger);
    const search = document.querySelector<HTMLInputElement>("input[placeholder='Search applications...']")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(search, "nothing here");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("No application found.");
    view.unmount();
  });
});

describe("uninstalledSuggestions", () => {
  it("keeps presets no action uses yet", () => {
    expect(uninstalledSuggestions(suggestions, [])).toEqual(suggestions);
  });

  it("hides a preset an action already installed, matched by app and exact command", () => {
    const installed = [{ id: "ac-1", name: "Zed {workspace}", runInTerminal: false, command: "zed {workspace}", appId: "zed", ownButton: false }];
    expect(uninstalledSuggestions(suggestions, installed).map((s) => s.key)).toEqual(["zed:path", "bbedit:path"]);
    // A different app or a plain user action (no appId) hides nothing.
    expect(uninstalledSuggestions(suggestions, [{ ...installed[0], appId: "bbedit" }])).toEqual(suggestions);
    expect(uninstalledSuggestions(suggestions, [{ ...installed[0], appId: undefined }])).toEqual(suggestions);
  });
});

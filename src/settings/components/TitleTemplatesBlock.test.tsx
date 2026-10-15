// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { FACTORY_TITLE_DEFAULTS } from "@/modules/workspaces/lib/defaultTitles";
import { TITLE_VARIABLE_DOCS } from "@/modules/workspaces/lib/titleTemplate";
import { TitleTemplatesBlock } from "./TitleTemplatesBlock";

const setTitleTemplate = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/modules/settings/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/settings/store")>()),
  setTitleTemplate,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(TitleTemplatesBlock));
  });
  return { container, unmount: () => act(() => root.unmount()) };
}

function field(container: HTMLElement, id: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`#title-template-${id}`);
  if (!el) throw new Error(`missing field ${id}`);
  return el;
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function blur(input: HTMLInputElement) {
  act(() => {
    input.focus();
    input.blur();
  });
}

describe("TitleTemplatesBlock", () => {
  beforeEach(() => {
    setTitleTemplate.mockClear();
    usePreferencesStore.setState({
      titleTemplateTerminal: "",
      titleTemplateAgent: "",
      titleTemplateEditor: "",
      titleTemplateDiff: "",
      titleTemplateBrowser: "",
      titleTemplateGitHistory: "",
      titleTemplateWorkspace: "",
    });
  });

  it("shows one field per default, with the factory template as placeholder", () => {
    const { container, unmount } = mount();
    const inputs = [...container.querySelectorAll("input")];
    expect(inputs.map((i) => i.placeholder)).toEqual([
      FACTORY_TITLE_DEFAULTS.terminal,
      FACTORY_TITLE_DEFAULTS.agent,
      FACTORY_TITLE_DEFAULTS.gitHistory,
      FACTORY_TITLE_DEFAULTS.browser,
      FACTORY_TITLE_DEFAULTS.diff,
      FACTORY_TITLE_DEFAULTS.editor,
      FACTORY_TITLE_DEFAULTS.workspace,
    ]);
    unmount();
  });

  it("lists the variables common to every tab before the specific ones", () => {
    const { container, unmount } = mount();
    const text = container.querySelector("table")?.textContent ?? "";
    const at = (s: string) => text.indexOf(s);
    expect(at("Any tab or workspace")).toBeGreaterThan(-1);
    expect(at("{cwd}")).toBeLessThan(at("Terminals"));
    expect(at("{cmd}")).toBeGreaterThan(at("Terminals"));
    expect(at("{file}")).toBeGreaterThan(at("Editors and diffs"));
    expect(at("{url}")).toBeGreaterThan(at("Browsers"));
    expect(at("{tab}")).toBeGreaterThan(at("Workspaces only"));
    unmount();
  });

  it("gives an example for every variable", () => {
    const { container, unmount } = mount();
    const text = container.textContent ?? "";
    for (const v of TITLE_VARIABLE_DOCS) {
      expect(v.example).not.toBe("");
      expect(text).toContain(v.example);
    }
    unmount();
  });

  it("explains the variables and the syntax once, in a single table", () => {
    const { container, unmount } = mount();
    expect(container.querySelectorAll("table")).toHaveLength(1);
    const cells = [...container.querySelectorAll("td:first-child")].map((c) => c.textContent);
    expect(cells).toContain("{branch}");
    expect(cells).toContain("{a|b|c}");
    expect(cells).toContain("{?var text}");
    expect(new Set(cells).size).toBe(cells.length);
    unmount();
  });

  it("puts each label and its input on the same row", () => {
    const { container, unmount } = mount();
    const input = field(container, "workspace");
    expect(input.parentElement?.querySelector("label")?.textContent).toBe("Workspace:");
    unmount();
  });

  it("saves a trimmed template on blur and shows it trimmed", () => {
    const { container, unmount } = mount();
    const input = field(container, "terminal");
    type(input, "  {dir}{?branch · {branch}}  ");
    blur(input);
    expect(setTitleTemplate).toHaveBeenCalledWith("titleTemplateTerminal", "{dir}{?branch · {branch}}");
    expect(input.value).toBe("{dir}{?branch · {branch}}");
    unmount();
  });

  it("does not write when nothing changed", () => {
    const { container, unmount } = mount();
    blur(field(container, "editor"));
    expect(setTitleTemplate).not.toHaveBeenCalled();
    unmount();
  });

  it("shows a saved template, and the reset button clears it", () => {
    act(() => usePreferencesStore.setState({ titleTemplateBrowser: "{host} {url}" }));
    const { container, unmount } = mount();
    const input = field(container, "browser");
    expect(input.value).toBe("{host} {url}");
    const reset = input.parentElement?.querySelector<HTMLButtonElement>("button[title='Reset to default']");
    expect(reset?.disabled).toBe(false);
    act(() => reset?.click());
    expect(setTitleTemplate).toHaveBeenCalledWith("titleTemplateBrowser", "");
    expect(input.value).toBe("");
    unmount();
  });
});

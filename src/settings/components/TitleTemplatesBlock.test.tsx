// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    setTitleTemplate.mockReset();
    setTitleTemplate.mockImplementation(async () => {});
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

  it("shows one field per default, already holding the default template to edit", () => {
    const { container, unmount } = mount();
    const inputs = [...container.querySelectorAll("input")];
    expect(inputs.map((i) => i.value)).toEqual([
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
    expect(at("{host}")).toBeLessThan(at("Terminals, editors and diff"));
    expect(at("{cwd}")).toBeGreaterThan(at("Terminals, editors and diff"));
    const terminals = text.indexOf("Terminals", at("Terminals, editors and diff") + 30);
    expect(at("{cwd}")).toBeLessThan(terminals);
    expect(at("{cmd}")).toBeGreaterThan(terminals);
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
    expect(cells).toContain("{?a|b text}");
    expect(cells).toContain("{!a|b text}");
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

  it("does not save a template that equals the default, so the default keeps following Kex", () => {
    const { container, unmount } = mount();
    const input = field(container, "terminal");
    type(input, "{cmd}");
    type(input, ` ${FACTORY_TITLE_DEFAULTS.terminal} `);
    blur(input);
    expect(setTitleTemplate).not.toHaveBeenCalled();
    unmount();
  });

  it("typing the default over a saved template clears the saved one", () => {
    act(() => usePreferencesStore.setState({ titleTemplateTerminal: "{dir}" }));
    const { container, unmount } = mount();
    const input = field(container, "terminal");
    expect(input.value).toBe("{dir}");
    type(input, FACTORY_TITLE_DEFAULTS.terminal);
    blur(input);
    expect(setTitleTemplate).toHaveBeenCalledWith("titleTemplateTerminal", "");
    unmount();
  });

  it("clearing a field puts the default back on blur", () => {
    act(() => usePreferencesStore.setState({ titleTemplateBrowser: "{host} {url}" }));
    const { container, unmount } = mount();
    const input = field(container, "browser");
    type(input, "");
    blur(input);
    expect(setTitleTemplate).toHaveBeenCalledWith("titleTemplateBrowser", "");
    expect(input.value).toBe(FACTORY_TITLE_DEFAULTS.browser);
    unmount();
  });

  it("the reset button restores the default, and is off while the field already shows it", () => {
    act(() => usePreferencesStore.setState({ titleTemplateBrowser: "{host} {url}" }));
    const { container, unmount } = mount();
    const input = field(container, "browser");
    const reset = input.parentElement?.querySelector<HTMLButtonElement>("button[title='Reset to default']");
    expect(reset?.disabled).toBe(false);
    act(() => reset?.click());
    expect(setTitleTemplate).toHaveBeenCalledWith("titleTemplateBrowser", "");
    expect(input.value).toBe(FACTORY_TITLE_DEFAULTS.browser);
    expect(reset?.disabled).toBe(true);
    unmount();
  });

  it("saves while typing in bursts, not on every keystroke", () => {
    vi.useFakeTimers();
    try {
      const { container, unmount } = mount();
      const input = field(container, "workspace");
      act(() => input.focus());
      type(input, "{d");
      type(input, "{di");
      type(input, "{dir}!");
      expect(setTitleTemplate).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(250));
      expect(setTitleTemplate).toHaveBeenCalledTimes(1);
      expect(setTitleTemplate).toHaveBeenCalledWith("titleTemplateWorkspace", "{dir}!");
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not overwrite what is being typed when the saved value changes underneath", () => {
    const { container, unmount } = mount();
    const input = field(container, "terminal");
    act(() => input.focus());
    type(input, "{dir} abc");
    act(() => usePreferencesStore.setState({ titleTemplateTerminal: "{dir} ab" }));
    expect(input.value).toBe("{dir} abc");
    unmount();
  });

  it("follows a change made elsewhere while the field is not being edited", () => {
    const { container, unmount } = mount();
    const input = field(container, "terminal");
    act(() => usePreferencesStore.setState({ titleTemplateTerminal: "{host}" }));
    expect(input.value).toBe("{host}");
    unmount();
  });

  describe("while a save is still on its way back from the store", () => {
    beforeEach(() => {
      setTitleTemplate.mockImplementation(() => new Promise<void>(() => {}));
      vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it("still saves a revert to the default made before the first save came back", () => {
      const { container, unmount } = mount();
      const input = field(container, "terminal");
      act(() => input.focus());
      type(input, "x");
      act(() => vi.advanceTimersByTime(250));
      type(input, FACTORY_TITLE_DEFAULTS.terminal);
      act(() => vi.advanceTimersByTime(250));
      expect(setTitleTemplate.mock.calls).toEqual([
        ["titleTemplateTerminal", "x"],
        ["titleTemplateTerminal", ""],
      ]);
      unmount();
    });

    it("does not flash an older value when the echo of an earlier save arrives after blur", () => {
      const { container, unmount } = mount();
      const input = field(container, "terminal");
      act(() => input.focus());
      type(input, "ab");
      act(() => vi.advanceTimersByTime(250));
      type(input, "abc");
      blur(input);
      act(() => usePreferencesStore.setState({ titleTemplateTerminal: "ab" }));
      expect(input.value).toBe("abc");
      unmount();
    });
  });

  it("shows a value changed elsewhere while the field had focus, once it loses it", () => {
    const { container, unmount } = mount();
    const input = field(container, "terminal");
    act(() => input.focus());
    act(() => usePreferencesStore.setState({ titleTemplateTerminal: "other" }));
    expect(input.value).toBe(FACTORY_TITLE_DEFAULTS.terminal);
    act(() => input.blur());
    expect(input.value).toBe("other");
    unmount();
  });

  it("saves a pending edit when the section is left", () => {
    vi.useFakeTimers();
    try {
      const { container, unmount } = mount();
      const input = field(container, "diff");
      act(() => input.focus());
      type(input, "diff {file}");
      unmount();
      expect(setTitleTemplate).toHaveBeenCalledWith("titleTemplateDiff", "diff {file}");
    } finally {
      vi.useRealTimers();
    }
  });
});

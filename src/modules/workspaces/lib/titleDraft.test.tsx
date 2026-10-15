// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTitleDraft, getTitleDraft, setTitleDraft, withTitleDraft } from "./titleDraftStore";
import type { Tab } from "./types";
import { useAgentTabTitle } from "./useAgentTabTitle";
import { useWorkspaceTitle } from "./workspaceTitle";

vi.mock("@tauri-apps/api/path", () => ({ homeDir: async () => "/home/me" }));
vi.mock("@tauri-apps/plugin-os", () => ({ hostname: async () => "mac" }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tab: Tab = { id: "tab-1", kind: "terminal", cwd: "/srv/code/kex", title: "saved" };

function render(node: () => string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const Probe = () => createElement("span", null, node());
  act(() => root.render(createElement(Probe)));
  return { container, unmount: () => act(() => root.unmount()) };
}

afterEach(() => {
  clearTitleDraft("tab-1");
  clearTitleDraft("ws-1");
});

describe("titleDraftStore", () => {
  it("keeps a draft per id until it is cleared", () => {
    setTitleDraft("tab-1", "{dir}");
    expect(getTitleDraft("tab-1")).toBe("{dir}");
    expect(getTitleDraft("tab-2")).toBeUndefined();
    clearTitleDraft("tab-1");
    expect(getTitleDraft("tab-1")).toBeUndefined();
  });

  it("an empty draft is a draft, not no draft", () => {
    setTitleDraft("tab-1", "");
    expect(getTitleDraft("tab-1")).toBe("");
    expect(withTitleDraft({ title: "saved" }, "")).toEqual({ title: "" });
    expect(withTitleDraft({ title: "saved" }, undefined)).toEqual({ title: "saved" });
  });
});

describe("a title follows what is being typed", () => {
  it("a tab shows the expansion of the draft and goes back when it is cleared", () => {
    const { container, unmount } = render(() => useAgentTabTitle(tab)?.displayTitle ?? "");
    expect(container.textContent).toBe("saved");
    act(() => setTitleDraft("tab-1", "{dir}{?cwd  in {cwd}}"));
    expect(container.textContent).toBe("kex in /srv/code/kex");
    act(() => setTitleDraft("tab-1", "{di"));
    expect(container.textContent).toBe("{di");
    act(() => clearTitleDraft("tab-1"));
    expect(container.textContent).toBe("saved");
    unmount();
  });

  it("an emptied tab draft shows the default title of its kind", () => {
    const { container, unmount } = render(() => useAgentTabTitle(tab)?.displayTitle ?? "");
    act(() => setTitleDraft("tab-1", ""));
    expect(container.textContent).toBe("kex");
    unmount();
  });

  it("only the tab being renamed changes", () => {
    const other: Tab = { id: "tab-2", kind: "terminal", cwd: "/x", title: "other" };
    const { container, unmount } = render(() => useAgentTabTitle(other)?.displayTitle ?? "");
    act(() => setTitleDraft("tab-1", "changed"));
    expect(container.textContent).toBe("other");
    unmount();
  });

  it("a workspace shows its draft, and the focused tab's draft through {tab}", () => {
    const ws = { id: "ws-1", title: "work", focusedTab: tab };
    const { container, unmount } = render(() => useWorkspaceTitle(ws));
    expect(container.textContent).toBe("work");
    act(() => setTitleDraft("ws-1", "[{tab}]"));
    expect(container.textContent).toBe("[saved]");
    act(() => setTitleDraft("tab-1", "{dir}"));
    expect(container.textContent).toBe("[kex]");
    unmount();
  });
});

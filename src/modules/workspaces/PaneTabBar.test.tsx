// @vitest-environment happy-dom

import { DndContext } from "@dnd-kit/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p }));
vi.mock("@/modules/editor/lib/useEditorThemeExt", () => ({ useEditorThemeExt: () => [] }));

vi.mock("@/modules/theme/ThemeProvider", () => ({ useTheme: () => ({ resolvedMode: "dark" }) }));

import { PaneTabBar } from "./PaneTabBar";
import { useTabRenameStore } from "./lib/tabRenameStore";
import type { Tab } from "./lib/types";

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function setup(initial: Tab) {
  let tab = initial;
  const onUpdateTab = vi.fn((_id: string, updater: (p: Tab) => Tab) => {
    tab = updater(tab);
  });
  const onRenameTab = vi.fn((_id: string, title: string | undefined) => {
    tab = { ...tab, title };
  });
  const onActivate = vi.fn();
  const noop = () => {};
  const ui = () => (
    <DndContext>
      <PaneTabBar
        tabs={[tab]}
        activeTabId={tab.id}
        paneFocused
        workspaceId="ws-1"
        isWorkspaceActive
        onActivate={onActivate}
        onClose={noop}
        onNewTerminal={noop}
        onCloseOtherTabs={noop}
        onSplitTerminalRight={noop}
        onSplitTerminalDown={noop}
        onNewBrowser={noop}
        onSplitBrowserRight={noop}
        onSplitBrowserDown={noop}
        onRenameTab={onRenameTab}
        onUpdateTab={onUpdateTab}
      />
    </DndContext>
  );
  const view = render(ui());
  const rerender = () => view.rerender(ui());
  return { onUpdateTab, onRenameTab, onActivate, rerender, getTab: () => tab };
}

describe("PaneTabBar rename and note", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", RO);
    useTabRenameStore.setState({ renamingTabId: null, templatesOpen: false });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("the rename popover has no note field and saves its title on blur", () => {
    const { onRenameTab, getTab } = setup({ id: "tab-1", kind: "terminal", note: "keep me" });
    act(() => useTabRenameStore.getState().startRename("tab-1"));
    expect(document.querySelector("textarea")).toBeNull();
    const title = screen.getByPlaceholderText(/./) as HTMLInputElement;
    title.value = "  build ";
    fireEvent.blur(title);
    expect(onRenameTab).toHaveBeenCalledWith("tab-1", "build");
    expect(getTab()).toMatchObject({ title: "build", note: "keep me" });
    expect(useTabRenameStore.getState().renamingTabId).toBeNull();
  });

  it("Enter saves the title", () => {
    const { onRenameTab } = setup({ id: "tab-1", kind: "terminal" });
    act(() => useTabRenameStore.getState().startRename("tab-1"));
    const title = screen.getByPlaceholderText(/./) as HTMLInputElement;
    title.value = "renamed";
    fireEvent.keyDown(title, { key: "Enter" });
    expect(onRenameTab).toHaveBeenCalledWith("tab-1", "renamed");
  });

  it("shows the note icon only when the tab has a note", () => {
    setup({ id: "tab-1", kind: "terminal", note: "x" });
    expect(screen.queryByLabelText("Tab note")).not.toBeNull();
    cleanup();
    setup({ id: "tab-2", kind: "terminal" });
    expect(screen.queryByLabelText("Tab note")).toBeNull();
  });

  it("clicking the icon shows a hidden note and hides an open one", () => {
    const { onUpdateTab, onActivate, getTab, rerender } = setup({ id: "tab-1", kind: "terminal", note: "x" });
    fireEvent.click(screen.getByLabelText("Tab note"));
    expect(onActivate).toHaveBeenCalledWith("tab-1");
    expect(getTab()).toMatchObject({ note: "x", noteOpen: true });
    rerender();
    expect(screen.getByLabelText("Tab note").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByLabelText("Tab note"));
    expect(onUpdateTab).toHaveBeenCalledTimes(2);
    expect(getTab().noteOpen).toBeUndefined();
    expect(getTab().note).toBe("x");
  });
});

describe("PaneTabBar plus button", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", RO));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sits outside the scrolling tab strip so it never scrolls out of view", () => {
    setup({ id: "tab-1", kind: "terminal" });
    const plus = screen.getByText("+");
    const strip = document.querySelector("[data-tab-id]")!.parentElement!;
    expect(strip.contains(plus)).toBe(false);
    expect(strip.className).toContain("overflow-x-auto");
  });
});

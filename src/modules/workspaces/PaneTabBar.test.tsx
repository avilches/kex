// @vitest-environment happy-dom

import { DndContext } from "@dnd-kit/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  const noop = () => {};
  const ui = () => (
    <DndContext>
      <PaneTabBar
        tabs={[tab]}
        activeTabId={tab.id}
        paneFocused
        workspaceId="ws-1"
        isWorkspaceActive
        onActivate={noop}
        onClose={noop}
        onNewTerminal={noop}
        onCloseOtherTabs={noop}
        onCloseAllTabs={noop}
        onSplitTerminalRight={noop}
        onSplitTerminalDown={noop}
        onNewBrowser={noop}
        onSplitBrowserRight={noop}
        onSplitBrowserDown={noop}
        onRenameTab={noop}
        onUpdateTab={onUpdateTab}
      />
    </DndContext>
  );
  const view = render(ui());
  void view;
  return { onUpdateTab, getTab: () => tab };
}

describe("PaneTabBar rename and note", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", RO);
    useTabRenameStore.setState({ renamingTabId: null, step: "title", saveSeq: 0 });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("moves from the title to the note without saving, then saves both on request", () => {
    const { onUpdateTab, getTab } = setup({ id: "tab-1", kind: "terminal" });
    act(() => useTabRenameStore.getState().startRename("tab-1"));

    const title = screen.getByPlaceholderText(/./) as HTMLInputElement;
    fireEvent.change(title, { target: { value: "build" } });
    title.value = "build";

    act(() => useTabRenameStore.getState().goToNote());
    expect(onUpdateTab).not.toHaveBeenCalled();
    const note = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(note).not.toBeNull();
    note.value = "- one\n- two";

    act(() => useTabRenameStore.getState().requestSave());
    expect(onUpdateTab).toHaveBeenCalledTimes(1);
    expect(getTab()).toMatchObject({ title: "build", note: "- one\n- two" });
    expect(useTabRenameStore.getState().renamingTabId).toBeNull();
  });

  it("saving from the title step keeps an existing note", () => {
    const { getTab } = setup({ id: "tab-1", kind: "terminal", note: "keep me" });
    act(() => useTabRenameStore.getState().startRename("tab-1"));
    const title = screen.getByPlaceholderText(/./) as HTMLInputElement;
    title.value = "renamed";
    fireEvent.keyDown(title, { key: "Enter" });
    expect(getTab()).toMatchObject({ title: "renamed", note: "keep me" });
  });

  it("starting on the note step shows the textarea with the current note", () => {
    setup({ id: "tab-1", kind: "terminal", note: "hello" });
    act(() => useTabRenameStore.getState().startRename("tab-1", "note"));
    const note = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(note.value).toBe("hello");
    expect(document.activeElement).toBe(note);
  });

  it("focuses the textarea when moving from the title to the note", () => {
    setup({ id: "tab-1", kind: "terminal" });
    act(() => useTabRenameStore.getState().startRename("tab-1"));
    act(() => useTabRenameStore.getState().goToNote());
    expect(document.activeElement).toBe(document.querySelector("textarea"));
    expect(useTabRenameStore.getState().renamingTabId).toBe("tab-1");
  });

  it("shows the note icon only when the tab has a note", () => {
    setup({ id: "tab-1", kind: "terminal", note: "x" });
    expect(screen.queryByLabelText("Tab note")).not.toBeNull();
    cleanup();
    setup({ id: "tab-2", kind: "terminal" });
    expect(screen.queryByLabelText("Tab note")).toBeNull();
  });

  it("the hover card pin button pins the tab and closes the card", async () => {
    const { onUpdateTab, getTab } = setup({ id: "tab-1", kind: "terminal", note: "x" });
    fireEvent.pointerEnter(screen.getByLabelText("Tab note"), { pointerType: "mouse" });
    const pin = await waitFor(() => screen.getByLabelText("Pin note"));
    fireEvent.click(pin);
    expect(onUpdateTab).toHaveBeenCalledTimes(1);
    expect(getTab()).toMatchObject({ notePinned: true });
    await waitFor(() => expect(screen.queryByLabelText("Pin note")).toBeNull());
  });

  it("does not open the hover card for a pinned tab", async () => {
    setup({ id: "tab-1", kind: "terminal", note: "x", notePinned: true });
    fireEvent.pointerEnter(screen.getByLabelText("Tab note"), { pointerType: "mouse" });
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByLabelText("Pin note")).toBeNull();
  });
});

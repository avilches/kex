// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p }));
vi.mock("@/modules/editor/lib/useEditorThemeExt", () => ({ useEditorThemeExt: () => [] }));
vi.mock("@/modules/theme/ThemeProvider", () => ({ useTheme: () => ({ resolvedMode: "dark" }) }));

import { FloatingTabNote } from "./FloatingTabNote";
import { flushTabNote, useTabNoteStore } from "./lib/tabNoteStore";
import type { Tab } from "./lib/types";

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;

function setup(tab: Tab, active = true, extra: Partial<ComponentProps<typeof FloatingTabNote>> = {}) {
  let current = tab;
  const onUpdateTab = vi.fn((_id: string, updater: (p: Tab) => Tab) => {
    current = updater(current);
  });
  const pane = document.createElement("div");
  const bar = document.createElement("div");
  const tabEl = document.createElement("div");
  tabEl.setAttribute("data-tab-id", tab.id);
  pane.append(bar, tabEl);
  document.body.append(pane);
  pane.getBoundingClientRect = () => rect(0, 0, 800, 600);
  tabEl.getBoundingClientRect = () => rect(100, 0, 80, 20);
  Object.defineProperty(bar, "offsetHeight", { value: 32, configurable: true });
  const view = render(
    <FloatingTabNote
      tab={tab}
      active={active}
      paneRef={{ current: pane }}
      tabBarRef={{ current: bar }}
      layoutKey={tab.id}
      onUpdateTab={onUpdateTab}
      {...extra}
    />,
  );
  return { onUpdateTab, getTab: () => current, view };
}

const open: Tab = { id: "tab-1", kind: "terminal", note: "hello", noteOpen: true };

describe("FloatingTabNote", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", RO);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(60);
    useTabNoteStore.setState({ focusTabId: null });
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders only for an active tab with an open note, even an empty one", () => {
    setup(open);
    expect(screen.queryByTestId("tab-note-handle")).not.toBeNull();
    cleanup();
    setup({ ...open, note: "" });
    expect(screen.queryByTestId("tab-note-handle")).not.toBeNull();
    cleanup();
    setup(open, false);
    expect(screen.queryByTestId("tab-note-handle")).toBeNull();
    cleanup();
    setup({ ...open, noteOpen: false });
    expect(screen.queryByTestId("tab-note-handle")).toBeNull();
    cleanup();
    setup({ id: "tab-2", kind: "terminal", noteOpen: true });
    expect(screen.queryByTestId("tab-note-handle")).toBeNull();
  });

  it("edits the note in the Live Preview editor and stores each change on the tab", async () => {
    const { getTab, onUpdateTab } = setup(open);
    const content = await waitFor(() => {
      const el = document.querySelector(".cm-content") as HTMLElement | null;
      if (!el) throw new Error("editor not mounted");
      return el;
    });
    const view = EditorView.findFromDOM(content);
    expect(view?.state.doc.toString()).toBe("hello");
    view?.dispatch({ changes: { from: 5, insert: " world" } });
    view?.dispatch({ changes: { from: 11, insert: "!" } });
    expect(onUpdateTab).not.toHaveBeenCalled();
    await waitFor(() => expect(onUpdateTab).toHaveBeenCalledTimes(1));
    expect(getTab()).toMatchObject({ note: "hello world!", noteOpen: true });
  });

  it("flushes pending text right away on request, on blur and on unmount", async () => {
    const { getTab, view } = setup(open);
    const content = await waitFor(() => {
      const el = document.querySelector(".cm-content") as HTMLElement | null;
      if (!el) throw new Error("editor not mounted");
      return el;
    });
    const cm = EditorView.findFromDOM(content);
    cm?.dispatch({ changes: { from: 5, insert: "1" } });
    flushTabNote("tab-1");
    expect(getTab().note).toBe("hello1");
    cm?.dispatch({ changes: { from: 6, insert: "2" } });
    fireEvent.blur(document.querySelector("[data-tab-note]") as HTMLElement);
    expect(getTab().note).toBe("hello12");
    cm?.dispatch({ changes: { from: 7, insert: "3" } });
    view.unmount();
    expect(getTab().note).toBe("hello123");
  });

  it("focuses the editor when the toggle shortcut requested it", async () => {
    useTabNoteStore.getState().requestFocus("tab-1");
    setup({ ...open, note: "" });
    await waitFor(() => expect(document.activeElement?.classList.contains("cm-content")).toBe(true));
    expect(useTabNoteStore.getState().focusTabId).toBeNull();
  });

  it("does not take focus when no request is pending", async () => {
    setup(open);
    await waitFor(() => expect(document.querySelector(".cm-content")).not.toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement?.classList.contains("cm-content")).toBe(false);
  });

  it("commits a moved position once after a drag", () => {
    const { onUpdateTab, getTab } = setup(open);
    const handle = screen.getByTestId("tab-note-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 230, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 250, clientY: 100, pointerId: 1 });
    expect(onUpdateTab).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { clientX: 250, clientY: 100, pointerId: 1 });
    expect(onUpdateTab).toHaveBeenCalledTimes(1);
    // Docked at x=100, y=tab bar height 32; moved by (50, 50).
    expect(getTab().notePos).toEqual({ x: 150, y: 82 });
    expect(getTab().noteOpen).toBe(true);
  });

  it("commits the new size once after a resize, clamped to the pane edge", () => {
    const { onUpdateTab, getTab } = setup(open);
    const grip = screen.getByTestId("tab-note-resize");
    fireEvent.pointerDown(grip, { button: 0, clientX: 400, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 450, clientY: 150, pointerId: 1 });
    expect(onUpdateTab).not.toHaveBeenCalled();
    fireEvent.pointerUp(grip, { clientX: 450, clientY: 150, pointerId: 1 });
    expect(onUpdateTab).toHaveBeenCalledTimes(1);
    expect(getTab().noteSize).toEqual({ width: 370, height: 120 });
    expect(getTab().noteOpen).toBe(true);
    fireEvent.pointerDown(grip, { button: 0, clientX: 400, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientX: 5000, clientY: 5000, pointerId: 1 });
  });

  it("clamps a dragged note inside the pane and below the tab bar", () => {
    const { getTab } = setup(open);
    const handle = screen.getByTestId("tab-note-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: -2000, clientY: -2000, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: -2000, clientY: -2000, pointerId: 1 });
    expect(getTab().notePos).toEqual({ x: 0, y: 32 });
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 5000, clientY: 5000, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 5000, clientY: 5000, pointerId: 1 });
    // Pane 800x600, note 320x60.
    expect(getTab().notePos).toEqual({ x: 480, y: 540 });
  });

  it("commits the last position even when pointerup arrives before React re-renders", () => {
    const { onUpdateTab, getTab } = setup(open);
    const handle = screen.getByTestId("tab-note-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 50, pointerId: 1 });
    const init = { bubbles: true, cancelable: true, pointerId: 1 };
    handle.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: 240, clientY: 70 }));
    handle.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX: 240, clientY: 70 }));
    expect(onUpdateTab).toHaveBeenCalledTimes(1);
    expect(getTab().notePos).toEqual({ x: 140, y: 52 });
  });

  it("commits nothing when the drag is cancelled", () => {
    const { onUpdateTab } = setup(open);
    const handle = screen.getByTestId("tab-note-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 260, clientY: 90, pointerId: 1 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(onUpdateTab).not.toHaveBeenCalled();
  });

  it("commits nothing for a click without movement", () => {
    const { onUpdateTab } = setup(open);
    const handle = screen.getByTestId("tab-note-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 200, clientY: 50, pointerId: 1 });
    expect(onUpdateTab).not.toHaveBeenCalled();
  });

  it("previews a closed note of an inactive tab docked under its tab, ignoring notePos", async () => {
    setup({ ...open, noteOpen: false, notePos: { x: 400, y: 300 } }, false, { preview: true });
    const note = document.querySelector("[data-tab-note]") as HTMLElement;
    await waitFor(() => expect(note.style.left).toBe("100px"));
    expect(note.style.top).toBe("32px");
  });

  it("keeps the saved size on a docked preview, capped to the pane", async () => {
    setup({ ...open, noteOpen: false, noteSize: { width: 400, height: 5000 } }, false, { preview: true });
    const note = document.querySelector("[data-tab-note]") as HTMLElement;
    await waitFor(() => expect(note.style.width).toBe("400px"));
    expect(note.style.height).toBe("568px");
  });

  it("previews a closed note of the active tab at its saved position", async () => {
    setup({ ...open, noteOpen: false, notePos: { x: 400, y: 300 } }, true, { preview: true });
    const note = document.querySelector("[data-tab-note]") as HTMLElement;
    await waitFor(() => expect(note.style.left).toBe("400px"));
    expect(note.style.top).toBe("300px");
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    setup(open, true, { onClose });
    fireEvent.click(screen.getByRole("button", { name: "Close note" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("drops a blank note when focus leaves it, and keeps one with text", () => {
    const blank = setup({ ...open, note: "  " });
    fireEvent.blur(document.querySelector("[data-tab-note]") as HTMLElement);
    expect(blank.getTab().note).toBeUndefined();
    cleanup();
    const text = setup(open);
    fireEvent.blur(document.querySelector("[data-tab-note]") as HTMLElement);
    expect(text.getTab().note).toBe("hello");
  });

  it("keeps a blank note when focus moves inside it", () => {
    const { getTab } = setup({ ...open, note: "" });
    const note = document.querySelector("[data-tab-note]") as HTMLElement;
    fireEvent.blur(note, { relatedTarget: screen.getByRole("button", { name: "Close note" }) });
    expect(getTab().note).toBe("");
  });

  it("hover notes have no close button; sticky ones do", () => {
    setup({ ...open, noteOpen: false }, true, { preview: true });
    expect(screen.queryByRole("button", { name: "Close note" })).toBeNull();
    cleanup();
    setup({ ...open, noteOpen: false }, false, { preview: true });
    expect(screen.queryByRole("button", { name: "Close note" })).toBeNull();
    cleanup();
    setup(open);
    expect(screen.queryByRole("button", { name: "Close note" })).not.toBeNull();
  });

  it("a hover note of an inactive tab cannot be dragged", () => {
    const { onUpdateTab } = setup({ ...open, noteOpen: false }, false, { preview: true });
    const handle = screen.getByTestId("tab-note-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 260, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 260, clientY: 90, pointerId: 1 });
    expect(onUpdateTab).not.toHaveBeenCalled();
  });

  it("dragging the hover note of the active tab makes it sticky", () => {
    const onPointerEnter = vi.fn();
    const { getTab } = setup({ ...open, noteOpen: false, notePos: undefined }, true, { preview: true, onPointerEnter });
    const handle = screen.getByTestId("tab-note-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 250, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 250, clientY: 100, pointerId: 1 });
    expect(getTab()).toMatchObject({ noteOpen: true, notePos: { x: 150, y: 82 } });
    expect(onPointerEnter).toHaveBeenCalled();
  });

  it("a hover note is dismissed when it loses focus, a sticky one is not", () => {
    const onDismiss = vi.fn();
    setup({ ...open, noteOpen: false }, true, { preview: true, onDismiss });
    fireEvent.blur(document.querySelector("[data-tab-note]") as HTMLElement);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    cleanup();
    onDismiss.mockClear();
    setup(open, true, { onDismiss });
    fireEvent.blur(document.querySelector("[data-tab-note]") as HTMLElement);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

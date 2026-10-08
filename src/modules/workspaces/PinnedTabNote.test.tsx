// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p }));
vi.mock("@/modules/editor/lib/useEditorThemeExt", () => ({ useEditorThemeExt: () => [] }));
vi.mock("@/modules/theme/ThemeProvider", () => ({ useTheme: () => ({ resolvedMode: "dark" }) }));

import { PinnedTabNote } from "./PinnedTabNote";
import type { Tab } from "./lib/types";

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;

function setup(tab: Tab, active = true) {
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
  render(
    <PinnedTabNote
      tab={tab}
      active={active}
      paneRef={{ current: pane }}
      tabBarRef={{ current: bar }}
      layoutKey={tab.id}
      onUpdateTab={onUpdateTab}
    />,
  );
  return { onUpdateTab, getTab: () => current };
}

const pinned: Tab = { id: "tab-1", kind: "terminal", note: "hello", notePinned: true };

describe("PinnedTabNote", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", RO);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(60);
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders only for an active tab with a pinned note", () => {
    setup(pinned);
    expect(screen.queryByLabelText("Unpin note")).not.toBeNull();
    cleanup();
    setup(pinned, false);
    expect(screen.queryByLabelText("Unpin note")).toBeNull();
    cleanup();
    setup({ ...pinned, notePinned: false });
    expect(screen.queryByLabelText("Unpin note")).toBeNull();
    cleanup();
    setup({ id: "tab-2", kind: "terminal", notePinned: true });
    expect(screen.queryByLabelText("Unpin note")).toBeNull();
  });

  it("unpin removes notePinned and notePos", () => {
    const { onUpdateTab, getTab } = setup({ ...pinned, notePos: { x: 5, y: 6 } });
    fireEvent.click(screen.getByLabelText("Unpin note"));
    expect(onUpdateTab).toHaveBeenCalledTimes(1);
    expect(getTab().notePinned).toBeUndefined();
    expect(getTab().notePos).toBeUndefined();
    expect(getTab().note).toBe("hello");
  });

  it("commits a moved position once after a drag", () => {
    const { onUpdateTab, getTab } = setup(pinned);
    const handle = screen.getByTestId("pinned-note-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 230, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 250, clientY: 100, pointerId: 1 });
    expect(onUpdateTab).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { clientX: 250, clientY: 100, pointerId: 1 });
    expect(onUpdateTab).toHaveBeenCalledTimes(1);
    // Docked at x=100, y=tab bar height 32; moved by (50, 50).
    expect(getTab().notePos).toEqual({ x: 150, y: 82 });
    expect(getTab().notePinned).toBe(true);
  });

  it("clamps a dragged note inside the pane and below the tab bar", () => {
    const { getTab } = setup(pinned);
    const handle = screen.getByTestId("pinned-note-handle");
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
    const { onUpdateTab, getTab } = setup(pinned);
    const handle = screen.getByTestId("pinned-note-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 50, pointerId: 1 });
    const init = { bubbles: true, cancelable: true, pointerId: 1 };
    handle.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: 240, clientY: 70 }));
    handle.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX: 240, clientY: 70 }));
    expect(onUpdateTab).toHaveBeenCalledTimes(1);
    expect(getTab().notePos).toEqual({ x: 140, y: 52 });
  });

  it("commits nothing when the drag is cancelled", () => {
    const { onUpdateTab } = setup(pinned);
    const handle = screen.getByTestId("pinned-note-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 260, clientY: 90, pointerId: 1 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(onUpdateTab).not.toHaveBeenCalled();
  });

  it("commits nothing for a click without movement", () => {
    const { onUpdateTab } = setup(pinned);
    const handle = screen.getByTestId("pinned-note-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 200, clientY: 50, pointerId: 1 });
    expect(onUpdateTab).not.toHaveBeenCalled();
  });
});

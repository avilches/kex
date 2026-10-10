// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const dnd = vi.hoisted(() => ({ dragging: null as object | null }));
vi.mock("./WorkspaceDndProvider", () => ({
  useWorkspaceDnd: () => ({ draggingItem: dnd.dragging }),
}));

import { NewTabMenuButton } from "./NewTabMenuButton";
import { HOVER_SWITCH_DELAY_MS } from "./lib/hoverSwitch";

function setup() {
  const handlers = {
    onNewTerminal: vi.fn(),
    onSplitTerminalRight: vi.fn(),
    onSplitTerminalDown: vi.fn(),
    onNewBrowser: vi.fn(),
    onSplitBrowserRight: vi.fn(),
    onSplitBrowserDown: vi.fn(),
  };
  const ui = () => <NewTabMenuButton {...handlers} />;
  const view = render(ui());
  return { ...handlers, plus: screen.getByText("+"), rerender: () => view.rerender(ui()) };
}

const menuOpen = () => screen.queryByText("New Terminal Tab") !== null;

describe("NewTabMenuButton", () => {
  beforeEach(() => {
    dnd.dragging = null;
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("a click creates a terminal and does not open the menu", () => {
    const { plus, onNewTerminal } = setup();
    fireEvent.click(plus);
    expect(onNewTerminal).toHaveBeenCalledTimes(1);
    expect(menuOpen()).toBe(false);
  });

  it("opens the menu with the six New actions after resting on the button", () => {
    const { plus } = setup();
    fireEvent.pointerEnter(plus);
    act(() => vi.advanceTimersByTime(HOVER_SWITCH_DELAY_MS - 1));
    expect(menuOpen()).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(menuOpen()).toBe(true);
    for (const label of [
      "New Terminal Tab",
      "New Terminal Split Right",
      "New Terminal Split Down",
      "New Browser Tab",
      "New Browser Split Right",
      "New Browser Split Down",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("does not open when the pointer leaves before the delay", () => {
    const { plus } = setup();
    fireEvent.pointerEnter(plus);
    act(() => vi.advanceTimersByTime(HOVER_SWITCH_DELAY_MS - 100));
    fireEvent.pointerLeave(plus);
    act(() => vi.advanceTimersByTime(1000));
    expect(menuOpen()).toBe(false);
  });

  it("a click cancels a pending hover", () => {
    const { plus, onNewTerminal } = setup();
    fireEvent.pointerEnter(plus);
    act(() => vi.advanceTimersByTime(HOVER_SWITCH_DELAY_MS - 100));
    fireEvent.click(plus);
    act(() => vi.advanceTimersByTime(1000));
    expect(onNewTerminal).toHaveBeenCalledTimes(1);
    expect(menuOpen()).toBe(false);
  });

  it("a right click opens the menu at once and cancels a pending hover", () => {
    const { plus } = setup();
    fireEvent.pointerEnter(plus);
    fireEvent.contextMenu(plus);
    expect(menuOpen()).toBe(true);
  });

  it("choosing an item runs its action and closes the menu", () => {
    const { plus, onSplitBrowserDown } = setup();
    fireEvent.contextMenu(plus);
    fireEvent.click(screen.getByText("New Browser Split Down"));
    expect(onSplitBrowserDown).toHaveBeenCalledTimes(1);
    expect(menuOpen()).toBe(false);
  });

  it("does not arm the hover while something is being dragged", () => {
    dnd.dragging = { kind: "tab" };
    const { plus } = setup();
    fireEvent.pointerEnter(plus);
    act(() => vi.advanceTimersByTime(HOVER_SWITCH_DELAY_MS * 2));
    expect(menuOpen()).toBe(false);
  });

  it("drops a pending hover when a drag starts before it fires", () => {
    const { plus, rerender } = setup();
    fireEvent.pointerEnter(plus);
    act(() => vi.advanceTimersByTime(HOVER_SWITCH_DELAY_MS - 100));
    dnd.dragging = { kind: "tab" };
    rerender();
    act(() => vi.advanceTimersByTime(1000));
    expect(menuOpen()).toBe(false);
  });
});

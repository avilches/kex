// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TabEntry } from "@/modules/command-palette";
import {
  cancelSwitcher,
  commitSwitcher,
  openSwitcher,
  stepSwitcher,
  switcherActive,
  useSwitcherStore,
} from "./switcherController";
import { REVEAL_DELAY_MS } from "./switcherModel";

const entries = ["a", "b", "c", "d"].map((tabId) => ({ tabId }) as TabEntry);
const chord = (o: KeyboardEventInit = {}) => new KeyboardEvent("keydown", { ctrlKey: true, ...o });
const key = (type: "keydown" | "keyup", init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }));

describe("switcher session", () => {
  const onCommit = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onCommit.mockReset();
  });
  afterEach(() => {
    cancelSwitcher();
    vi.useRealTimers();
  });

  it("opens on the previous tab, unpainted, and a quick release only goes to it", () => {
    openSwitcher(chord(), 1, entries, onCommit);
    expect(switcherActive()).toBe(true);
    expect(useSwitcherStore.getState()).toMatchObject({ index: 1, revealed: false });
    key("keyup", { key: "Control" });
    expect(onCommit).toHaveBeenCalledWith(entries[1]);
    expect(switcherActive()).toBe(false);
  });

  it("paints after the delay and keeps the pick while the modifier is held", () => {
    openSwitcher(chord(), 1, entries, onCommit);
    vi.advanceTimersByTime(REVEAL_DELAY_MS);
    expect(useSwitcherStore.getState().revealed).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("paints at once on a second step and wraps", () => {
    openSwitcher(chord(), 1, entries, onCommit);
    stepSwitcher(1);
    stepSwitcher(1);
    stepSwitcher(1);
    expect(useSwitcherStore.getState()).toMatchObject({ index: 0, revealed: true });
  });

  it("goes backwards from the oldest tab", () => {
    openSwitcher(chord({ shiftKey: true }), -1, entries, onCommit);
    expect(useSwitcherStore.getState().index).toBe(3);
  });

  it("cancels with Escape without choosing", () => {
    openSwitcher(chord(), 1, entries, onCommit);
    key("keydown", { key: "Escape", ctrlKey: true });
    expect(switcherActive()).toBe(false);
    key("keyup", { key: "Control" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("cancels when the window loses focus", () => {
    openSwitcher(chord(), 1, entries, onCommit);
    window.dispatchEvent(new Event("blur"));
    expect(switcherActive()).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("does not open for fewer than two tabs", () => {
    openSwitcher(chord(), 1, entries.slice(0, 1), onCommit);
    expect(switcherActive()).toBe(false);
  });

  it("a binding without modifiers shows at once and waits for Enter", () => {
    openSwitcher(new KeyboardEvent("keydown", {}), 1, entries, onCommit);
    expect(useSwitcherStore.getState().revealed).toBe(true);
    key("keyup", { key: "F4" });
    expect(onCommit).not.toHaveBeenCalled();
    key("keydown", { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(entries[1]);
  });

  it("commits the clicked tile, not the highlighted one", () => {
    openSwitcher(chord(), 1, entries, onCommit);
    commitSwitcher(3);
    expect(onCommit).toHaveBeenCalledWith(entries[3]);
  });

  it("swallows the keys it does not own so the terminal behind never sees them", () => {
    openSwitcher(chord(), 1, entries, onCommit);
    const e = new KeyboardEvent("keydown", { key: "a", ctrlKey: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});

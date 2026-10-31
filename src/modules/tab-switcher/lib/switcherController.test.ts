// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TabEntry } from "@/modules/command-palette";
import {
  cancelSwitcher,
  commitSwitcher,
  hoverSwitcher,
  menuSwitcher,
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

  it("a resting cursor never steers the pick, however many synthetic moves it reports", () => {
    openSwitcher(chord(), 1, entries, onCommit);
    stepSwitcher(1);
    expect(useSwitcherStore.getState().index).toBe(2);
    hoverSwitcher(0, { x: 50, y: 50 });
    hoverSwitcher(3, { x: 50, y: 50 });
    hoverSwitcher(0, { x: 51, y: 50 });
    expect(useSwitcherStore.getState().index).toBe(2);
  });

  it("a real shift of the pointer picks the tile under it", () => {
    openSwitcher(chord(), 1, entries, onCommit);
    hoverSwitcher(0, { x: 50, y: 50 });
    hoverSwitcher(3, { x: 90, y: 50 });
    expect(useSwitcherStore.getState().index).toBe(3);
  });

  it("slow drift under the slop never adds up to a pick", () => {
    openSwitcher(chord(), 1, entries, onCommit);
    hoverSwitcher(0, { x: 50, y: 50 });
    for (let x = 51; x <= 53; x++) hoverSwitcher(3, { x, y: 50 });
    expect(useSwitcherStore.getState().index).toBe(1);
  });

  it("forgets the pointer between sessions", () => {
    openSwitcher(chord(), 1, entries, onCommit);
    hoverSwitcher(0, { x: 50, y: 50 });
    cancelSwitcher();
    openSwitcher(chord(), 1, entries, onCommit);
    hoverSwitcher(3, { x: 200, y: 200 });
    expect(useSwitcherStore.getState().index).toBe(1);
  });

  describe("closing the highlighted tab", () => {
    type Close = (entry: TabEntry) => Promise<boolean> | undefined;
    const open = (n = 4, onClose?: Close) => openSwitcher(chord(), 1, entries.slice(0, n), onCommit, { onClose });
    const ids = () => useSwitcherStore.getState().entries.map((e) => e.tabId);
    const highlighted = () => {
      const { entries: list, index } = useSwitcherStore.getState();
      return list[index]?.tabId;
    };
    const press = (key: string, init: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent("keydown", { key, cancelable: true, ...init });
      window.dispatchEvent(e);
      return e;
    };
    const settle = async () => {
      for (let i = 0; i < 4; i++) await Promise.resolve();
    };

    it("closes the highlighted tab with a bare W, the way Q quits an app in the macOS switcher", async () => {
      const onClose = vi.fn(() => Promise.resolve(true));
      open(4, onClose);
      const e = press("w");
      await settle();
      expect(e.defaultPrevented).toBe(true);
      expect(onClose).toHaveBeenCalledWith(entries[1]);
      expect(ids()).toEqual(["a", "c", "d"]);
      expect(switcherActive()).toBe(true);
    });

    it("takes the W whichever modifier is held and in either case, so Cmd+W works too", async () => {
      for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
        const onClose = vi.fn(() => Promise.resolve(true));
        open(4, onClose);
        press("W", init);
        await settle();
        expect(onClose).toHaveBeenCalledTimes(1);
        cancelSwitcher();
      }
    });

    it("closes the tile that is highlighted now, not the one it opened on", async () => {
      const onClose = vi.fn(() => Promise.resolve(true));
      open(4, onClose);
      stepSwitcher(1);
      press("w");
      await settle();
      expect(onClose).toHaveBeenCalledWith(entries[2]);
    });

    it("keeps the tile when the close is cancelled", async () => {
      open(4, () => Promise.resolve(false));
      press("w");
      await settle();
      expect(ids()).toEqual(["a", "b", "c", "d"]);
    });

    it("keeps the tile when the host refuses without closing, as a locked tab does", async () => {
      open(4, () => undefined);
      press("w");
      await settle();
      expect(ids()).toHaveLength(4);
    });

    it("does nothing, but still swallows the key, when it was opened with no way to close", async () => {
      open(4);
      const e = press("w");
      await settle();
      expect(e.defaultPrevented).toBe(true);
      expect(ids()).toHaveLength(4);
    });

    it("highlights the tile that slid into the gap, and the previous one after closing the last", async () => {
      open(4, () => Promise.resolve(true));
      stepSwitcher(1);
      press("w");
      await settle();
      expect(ids()).toEqual(["a", "b", "d"]);
      expect(highlighted()).toBe("d");
      press("w");
      await settle();
      expect(ids()).toEqual(["a", "b"]);
      expect(highlighted()).toBe("b");
    });

    it("ends the session when fewer than two tiles would remain, without choosing anything", async () => {
      open(2, () => Promise.resolve(true));
      press("w");
      await settle();
      expect(switcherActive()).toBe(false);
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("lets keys through while the close waits, so a confirmation dialog can use Enter and Escape", async () => {
      let finish: (v: boolean) => void = () => {};
      open(4, () => new Promise<boolean>((r) => (finish = r)));
      press("w");
      const enter = press("Enter");
      expect(enter.defaultPrevented).toBe(false);
      expect(onCommit).not.toHaveBeenCalled();
      finish(true);
      await settle();
      expect(press("ArrowRight").defaultPrevented).toBe(true);
    });

    it("ignores a second W while the first close is still waiting", async () => {
      let finish: (v: boolean) => void = () => {};
      const onClose = vi.fn(() => new Promise<boolean>((r) => (finish = r)));
      open(4, onClose);
      press("w");
      press("w");
      expect(onClose).toHaveBeenCalledTimes(1);
      finish(true);
      await settle();
    });

    it("does not commit a jump if the modifier is released while a confirmation is open", async () => {
      let finish: (v: boolean) => void = () => {};
      open(4, () => new Promise<boolean>((r) => (finish = r)));
      press("w");
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control" }));
      expect(onCommit).not.toHaveBeenCalled();
      expect(switcherActive()).toBe(true);
      finish(false);
      await settle();
    });

    it("does nothing when the session already ended while the close was pending", async () => {
      let finish: (v: boolean) => void = () => {};
      open(4, () => new Promise<boolean>((r) => (finish = r)));
      press("w");
      cancelSwitcher();
      finish(true);
      await settle();
      expect(switcherActive()).toBe(false);
    });
  });

  describe("hibernating the highlighted tab", () => {
    type Sleep = (entry: TabEntry) => Promise<TabEntry | "dismiss" | null> | undefined;
    const open = (onSleep?: Sleep, sleepKey: string | null = "z") =>
      openSwitcher(chord(), 1, entries, onCommit, { onSleep, sleepKey });
    const press = (key: string, init: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent("keydown", { key, cancelable: true, ...init });
      window.dispatchEvent(e);
      return e;
    };
    const settle = async () => {
      for (let i = 0; i < 4; i++) await Promise.resolve();
    };
    const asleep = (e: TabEntry) => ({ ...e, hibernated: true }) as TabEntry;

    it("asks the app to hibernate the highlighted tab with the letter it was given", async () => {
      const onSleep = vi.fn((e: TabEntry) => Promise.resolve(asleep(e)));
      open(onSleep);
      const e = press("z");
      await settle();
      expect(e.defaultPrevented).toBe(true);
      expect(onSleep).toHaveBeenCalledWith(entries[1]);
    });

    it("keeps the tile and swaps in the refreshed entry, so it shows as asleep instead of vanishing", async () => {
      open((e) => Promise.resolve(asleep(e)));
      press("z");
      await settle();
      const list = useSwitcherStore.getState().entries;
      expect(list.map((e) => e.tabId)).toEqual(["a", "b", "c", "d"]);
      expect(list[1].hibernated).toBe(true);
      expect(useSwitcherStore.getState().index).toBe(1);
    });

    it("closes the switcher without jumping when the app asks to dismiss it, as when a confirmation opens", async () => {
      open(() => Promise.resolve("dismiss"));
      press("z");
      await settle();
      expect(switcherActive()).toBe(false);
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("takes the letter in either case and with any modifier held", async () => {
      for (const init of [{ ctrlKey: true }, { metaKey: true, altKey: true }, { shiftKey: true }]) {
        const onSleep = vi.fn((e: TabEntry) => Promise.resolve(asleep(e)));
        open(onSleep);
        press("Z", init);
        await settle();
        expect(onSleep).toHaveBeenCalledTimes(1);
        cancelSwitcher();
      }
    });

    it("uses whatever letter it was given, which is how a rebinding is followed", async () => {
      const onSleep = vi.fn((e: TabEntry) => Promise.resolve(asleep(e)));
      open(onSleep, "h");
      press("z");
      await settle();
      expect(onSleep).not.toHaveBeenCalled();
      press("h");
      await settle();
      expect(onSleep).toHaveBeenCalledTimes(1);
    });

    it("does nothing, but still swallows the key, when there is no letter for it", async () => {
      const onSleep = vi.fn((e: TabEntry) => Promise.resolve(asleep(e)));
      open(onSleep, null);
      const e = press("z");
      await settle();
      expect(e.defaultPrevented).toBe(true);
      expect(onSleep).not.toHaveBeenCalled();
    });

    it("leaves the tile as it was when the app declines, as for a tab that cannot sleep", async () => {
      open(() => undefined);
      press("z");
      await settle();
      expect(useSwitcherStore.getState().entries[1].hibernated).toBeUndefined();
    });

    it("leaves the tile as it was when the user cancels the confirmation", async () => {
      open(() => Promise.resolve(null));
      press("z");
      await settle();
      expect(useSwitcherStore.getState().entries[1].hibernated).toBeUndefined();
    });

    it("lets keys through while it waits, so a confirmation dialog can use Enter and Escape", async () => {
      let finish: (v: TabEntry | null) => void = () => {};
      open(() => new Promise<TabEntry | null>((r) => (finish = r)));
      press("z");
      expect(press("Enter").defaultPrevented).toBe(false);
      expect(onCommit).not.toHaveBeenCalled();
      finish(null);
      await settle();
      expect(press("ArrowRight").defaultPrevented).toBe(true);
    });

    it("shares its waiting with closing: neither starts while the other is pending", async () => {
      let finish: (v: TabEntry | null) => void = () => {};
      const onClose = vi.fn(() => Promise.resolve(true));
      openSwitcher(chord(), 1, entries, onCommit, {
        onClose,
        onSleep: () => new Promise<TabEntry | null>((r) => (finish = r)),
        sleepKey: "z",
      });
      press("z");
      press("w");
      expect(onClose).not.toHaveBeenCalled();
      finish(null);
      await settle();
    });

    it("does not touch a list that was replaced while it waited", async () => {
      let finish: (v: TabEntry | null) => void = () => {};
      open(() => new Promise<TabEntry | null>((r) => (finish = r)));
      press("z");
      cancelSwitcher();
      finish(asleep(entries[1]));
      await settle();
      expect(useSwitcherStore.getState().entries).toEqual([]);
    });
  });

  it("swallows the keys it does not own so the terminal behind never sees them", () => {
    openSwitcher(chord(), 1, entries, onCommit);
    const e = new KeyboardEvent("keydown", { key: "a", ctrlKey: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  describe("jumping with a digit", () => {
    it("commits the tile at that position and ends the session, with the modifier still held", () => {
      openSwitcher(chord(), 1, entries, onCommit);
      key("keydown", { code: "Digit3", key: "3", ctrlKey: true });
      expect(onCommit).toHaveBeenCalledWith(entries[2]);
      expect(switcherActive()).toBe(false);
    });

    it("reads the physical key, so Alt on a Mac (which types a symbol) still jumps", () => {
      openSwitcher(new KeyboardEvent("keydown", { altKey: true }), 1, entries, onCommit);
      key("keydown", { code: "Digit4", key: "¢", altKey: true });
      expect(onCommit).toHaveBeenCalledWith(entries[3]);
    });

    it("ignores a digit with no tile and keeps the session open, still swallowing the key", () => {
      openSwitcher(chord(), 1, entries, onCommit);
      const e = new KeyboardEvent("keydown", { code: "Digit9", key: "9", ctrlKey: true, cancelable: true });
      window.dispatchEvent(e);
      expect(onCommit).not.toHaveBeenCalled();
      expect(switcherActive()).toBe(true);
      expect(e.defaultPrevented).toBe(true);
    });
  });

  describe("with a tile menu open", () => {
    it("highlights the tile it opened on and flags the body so the menu draws above the overlay", () => {
      openSwitcher(chord(), 1, entries, onCommit);
      menuSwitcher(true, 3);
      expect(useSwitcherStore.getState().index).toBe(3);
      expect(document.body.dataset.switcherMenu).toBeDefined();
    });

    it("leaves the keys to the menu and does not commit when the modifier is released", () => {
      openSwitcher(chord(), 1, entries, onCommit);
      menuSwitcher(true, 2);
      const e = new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true });
      window.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
      key("keydown", { code: "Digit1", key: "1" });
      key("keyup", { key: "Control" });
      expect(onCommit).not.toHaveBeenCalled();
      expect(switcherActive()).toBe(true);
    });

    it("does not let Tab or the pointer move the highlight behind the menu", () => {
      openSwitcher(chord(), 1, entries, onCommit);
      menuSwitcher(true, 2);
      stepSwitcher(1);
      hoverSwitcher(0, { x: 0, y: 0 });
      hoverSwitcher(0, { x: 50, y: 50 });
      expect(useSwitcherStore.getState().index).toBe(2);
    });

    it("ends the session without choosing any tab when the menu closes, and clears the flag", () => {
      openSwitcher(chord(), 1, entries, onCommit);
      menuSwitcher(true, 2);
      menuSwitcher(false, 2);
      expect(switcherActive()).toBe(false);
      expect(onCommit).not.toHaveBeenCalled();
      expect(document.body.dataset.switcherMenu).toBeUndefined();
    });
  });
});

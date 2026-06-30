import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-log", () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

import {
  _clearAll,
  cleanOscTitle,
  clearOscTitle,
  getOscTitle,
  getSnapshot,
  setOscTitle,
  subscribe,
} from "./oscTitleStore";

beforeEach(() => {
  _clearAll();
});

describe("oscTitleStore", () => {
  it("returns undefined for an unknown tab", () => {
    expect(getOscTitle("tab-a")).toBeUndefined();
  });

  it("stores and retrieves a title", () => {
    setOscTitle("tab-a", "My Title");
    expect(getOscTitle("tab-a")).toBe("My Title");
  });

  it("clearOscTitle removes the title", () => {
    setOscTitle("tab-a", "My Title");
    clearOscTitle("tab-a");
    expect(getOscTitle("tab-a")).toBeUndefined();
  });

  it("clearOscTitle is a no-op for unknown tab", () => {
    expect(() => clearOscTitle("tab-unknown")).not.toThrow();
  });

  it("getSnapshot returns same reference when nothing changes", () => {
    const snap1 = getSnapshot();
    const snap2 = getSnapshot();
    expect(snap1).toBe(snap2);
  });

  it("getSnapshot returns new reference after setOscTitle", () => {
    const snap1 = getSnapshot();
    setOscTitle("tab-a", "Title");
    const snap2 = getSnapshot();
    expect(snap1).not.toBe(snap2);
  });

  it("getSnapshot returns new reference after clearOscTitle", () => {
    setOscTitle("tab-a", "Title");
    const snap1 = getSnapshot();
    clearOscTitle("tab-a");
    const snap2 = getSnapshot();
    expect(snap1).not.toBe(snap2);
  });

  it("subscribe notifies listeners when title changes", () => {
    const cb = vi.fn();
    const unsub = subscribe(cb);
    setOscTitle("tab-a", "New");
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("unsubscribed listener is not called", () => {
    const cb = vi.fn();
    const unsub = subscribe(cb);
    unsub();
    setOscTitle("tab-a", "New");
    expect(cb).not.toHaveBeenCalled();
  });

  it("strips leading status symbol from stored title", () => {
    setOscTitle("tab-a", "* doing something");
    expect(getOscTitle("tab-a")).toBe("doing something");
  });

  it("strips unicode status symbol from stored title", () => {
    setOscTitle("tab-a", "⏺ working on task");
    expect(getOscTitle("tab-a")).toBe("working on task");
  });

  it("does not strip leading letter", () => {
    setOscTitle("tab-a", "vim file.ts");
    expect(getOscTitle("tab-a")).toBe("vim file.ts");
  });

  it("setOscTitle is a no-op when title is unchanged", () => {
    setOscTitle("tab-a", "Same");
    const snap1 = getSnapshot();
    const cb = vi.fn();
    const unsub = subscribe(cb);
    setOscTitle("tab-a", "Same");
    expect(cb).not.toHaveBeenCalled();
    expect(getSnapshot()).toBe(snap1);
    unsub();
  });

  it("setOscTitle is a no-op when cleaned title is unchanged", () => {
    setOscTitle("tab-a", "* Same");
    const snap1 = getSnapshot();
    const cb = vi.fn();
    const unsub = subscribe(cb);
    setOscTitle("tab-a", "* Same");
    expect(cb).not.toHaveBeenCalled();
    expect(getSnapshot()).toBe(snap1);
    unsub();
  });

  describe("cleanOscTitle", () => {
    it("strips asterisk prefix", () => {
      expect(cleanOscTitle("* description")).toBe("description");
    });

    it("strips unicode symbol prefix", () => {
      expect(cleanOscTitle("⏺ working")).toBe("working");
      expect(cleanOscTitle("✓ done")).toBe("done");
      expect(cleanOscTitle("⊘ stopped")).toBe("stopped");
    });

    it("does not strip leading letters or digits", () => {
      expect(cleanOscTitle("bash")).toBe("bash");
      expect(cleanOscTitle("vim file.ts")).toBe("vim file.ts");
      expect(cleanOscTitle("1 file")).toBe("1 file");
    });

    it("does not strip when no space follows", () => {
      expect(cleanOscTitle("*description")).toBe("*description");
    });

    it("handles empty string", () => {
      expect(cleanOscTitle("")).toBe("");
    });
  });
});

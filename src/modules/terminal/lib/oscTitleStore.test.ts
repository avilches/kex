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
  it("returns undefined for an unknown panel", () => {
    expect(getOscTitle("panel-a")).toBeUndefined();
  });

  it("stores and retrieves a title", () => {
    setOscTitle("panel-a", "My Title");
    expect(getOscTitle("panel-a")).toBe("My Title");
  });

  it("clearOscTitle removes the title", () => {
    setOscTitle("panel-a", "My Title");
    clearOscTitle("panel-a");
    expect(getOscTitle("panel-a")).toBeUndefined();
  });

  it("clearOscTitle is a no-op for unknown panel", () => {
    expect(() => clearOscTitle("panel-unknown")).not.toThrow();
  });

  it("getSnapshot returns same reference when nothing changes", () => {
    const snap1 = getSnapshot();
    const snap2 = getSnapshot();
    expect(snap1).toBe(snap2);
  });

  it("getSnapshot returns new reference after setOscTitle", () => {
    const snap1 = getSnapshot();
    setOscTitle("panel-a", "Title");
    const snap2 = getSnapshot();
    expect(snap1).not.toBe(snap2);
  });

  it("getSnapshot returns new reference after clearOscTitle", () => {
    setOscTitle("panel-a", "Title");
    const snap1 = getSnapshot();
    clearOscTitle("panel-a");
    const snap2 = getSnapshot();
    expect(snap1).not.toBe(snap2);
  });

  it("subscribe notifies listeners when title changes", () => {
    const cb = vi.fn();
    const unsub = subscribe(cb);
    setOscTitle("panel-a", "New");
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("unsubscribed listener is not called", () => {
    const cb = vi.fn();
    const unsub = subscribe(cb);
    unsub();
    setOscTitle("panel-a", "New");
    expect(cb).not.toHaveBeenCalled();
  });

  it("strips leading status symbol from stored title", () => {
    setOscTitle("panel-a", "* doing something");
    expect(getOscTitle("panel-a")).toBe("doing something");
  });

  it("strips unicode status symbol from stored title", () => {
    setOscTitle("panel-a", "⏺ working on task");
    expect(getOscTitle("panel-a")).toBe("working on task");
  });

  it("does not strip leading letter", () => {
    setOscTitle("panel-a", "vim file.ts");
    expect(getOscTitle("panel-a")).toBe("vim file.ts");
  });

  it("setOscTitle is a no-op when title is unchanged", () => {
    setOscTitle("panel-a", "Same");
    const snap1 = getSnapshot();
    const cb = vi.fn();
    const unsub = subscribe(cb);
    setOscTitle("panel-a", "Same");
    expect(cb).not.toHaveBeenCalled();
    expect(getSnapshot()).toBe(snap1);
    unsub();
  });

  it("setOscTitle is a no-op when cleaned title is unchanged", () => {
    setOscTitle("panel-a", "* Same");
    const snap1 = getSnapshot();
    const cb = vi.fn();
    const unsub = subscribe(cb);
    setOscTitle("panel-a", "* Same");
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

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-log", () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

import {
  _clearAll,
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
});

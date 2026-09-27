import { describe, expect, it } from "vitest";
import { createFlashStore } from "./createFlashStore";

describe("createFlashStore", () => {
  it("starts with no tab flashed", () => {
    const store = createFlashStore();
    expect(store.getSnapshot()).toEqual({ tabId: null, seq: 0 });
  });

  it("bumps the sequence and records the flashed tab id", () => {
    const store = createFlashStore();
    store.flash("tab-1");
    expect(store.getSnapshot()).toEqual({ tabId: "tab-1", seq: 1 });
    store.flash("tab-1");
    expect(store.getSnapshot()).toEqual({ tabId: "tab-1", seq: 2 });
    store.flash("tab-2");
    expect(store.getSnapshot()).toEqual({ tabId: "tab-2", seq: 3 });
  });

  it("notifies subscribers on flash and lets them unsubscribe", () => {
    const store = createFlashStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls++;
    });
    store.flash("tab-1");
    expect(calls).toBe(1);
    unsubscribe();
    store.flash("tab-1");
    expect(calls).toBe(1);
  });

  it("keeps independent state across separate instances", () => {
    const a = createFlashStore();
    const b = createFlashStore();
    a.flash("tab-1");
    expect(a.getSnapshot()).toEqual({ tabId: "tab-1", seq: 1 });
    expect(b.getSnapshot()).toEqual({ tabId: null, seq: 0 });
  });
});

import { describe, expect, it } from "vitest";
import {
  claimToggle,
  isFreshHibernate,
  markHibernateFxPlayed,
  nextWakeState,
  shouldPlayHibernateFx,
  toggleLockSize,
} from "./hibernateFx";

describe("claimToggle", () => {
  it("rejects a second toggle of the same workspace while its transition runs", () => {
    expect(claimToggle("ws-a", 10_000)).toBe(true);
    expect(claimToggle("ws-a", 10_500)).toBe(false);
    expect(claimToggle("ws-a", 11_400)).toBe(true);
  });

  it("does not block other workspaces", () => {
    expect(claimToggle("ws-b", 20_000)).toBe(true);
    expect(claimToggle("ws-c", 20_100)).toBe(true);
  });

  it("evicts expired keys so the map stays bounded", () => {
    for (let i = 0; i < 50; i++) claimToggle(`ws-bound-${i}`, 30_000 + i);
    claimToggle("ws-bound-last", 40_000);
    expect(toggleLockSize()).toBe(1);
  });
});

describe("isFreshHibernate", () => {
  it("is fresh only inside the window and never without a timestamp", () => {
    expect(isFreshHibernate(undefined, 5_000)).toBe(false);
    expect(isFreshHibernate(5_000, 5_100)).toBe(true);
    expect(isFreshHibernate(5_000, 6_600)).toBe(false);
  });
});

describe("shouldPlayHibernateFx", () => {
  it("plays once per hibernation, so a remount in the window does not replay", () => {
    expect(shouldPlayHibernateFx("ws-x", 7_000, 7_100)).toBe(true);
    markHibernateFxPlayed("ws-x", 7_000);
    expect(shouldPlayHibernateFx("ws-x", 7_000, 7_200)).toBe(false);
  });

  it("plays again for a newer hibernation of the same workspace", () => {
    markHibernateFxPlayed("ws-y", 8_000);
    expect(shouldPlayHibernateFx("ws-y", 9_000, 9_100)).toBe(true);
  });

  it("does not play for an old hibernation", () => {
    expect(shouldPlayHibernateFx("ws-z", 1_000, 9_000)).toBe(false);
  });
});

describe("nextWakeState", () => {
  it("records the wake time in the same step the workspace stops being hibernated", () => {
    const s = nextWakeState({ hibernated: true, wokenAt: null }, false, 500);
    expect(s).toEqual({ hibernated: false, wokenAt: 500 });
  });

  it("clears the wake time when hibernating again", () => {
    expect(nextWakeState({ hibernated: false, wokenAt: 500 }, true, 600)).toEqual({
      hibernated: true,
      wokenAt: null,
    });
  });

  it("returns the same object when nothing changed, so it never loops", () => {
    const s = { hibernated: false, wokenAt: null };
    expect(nextWakeState(s, false, 700)).toBe(s);
  });
});

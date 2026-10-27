// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  save: vi.fn(async (_tabId: string, _text: string) => {}),
  del: vi.fn(async (_tabIds: readonly string[]) => {}),
}));
vi.mock("./hibernateLinesIo", () => ({
  saveHibernateLines: io.save,
  deleteHibernateLines: io.del,
  readHibernateLines: vi.fn(),
}));

import { usePreferencesStore } from "@/modules/settings/preferences";
import { applyHibernate, applyWake } from "./hibernate";
import { REDACTED } from "./hibernateLines";
import type { Tab, Workspace } from "./types";
import { keepLastLines } from "./useHibernateFlow";
import { useHibernateLinesCleanup } from "./useHibernateLinesCleanup";

const E = "\u001b";
const screen = (text: string) => ({ text, alt: false, rows: 24 });
const term = (id: string): Extract<Tab, { kind: "terminal" }> => ({ id, kind: "terminal" });
const workspace = (...ids: string[]): Workspace => ({
  id: "w1",
  title: "W",
  activePaneId: "p1",
  paneTree: { kind: "pane", id: "p1", tabs: ids.map(term), activeTabId: ids[0] },
});

describe("keepLastLines", () => {
  beforeEach(() => {
    io.save.mockReset();
    io.save.mockResolvedValue(undefined);
    usePreferencesStore.setState({ hibernateSaveLines: true });
  });

  it("stores each tab's screen with its colours and without its secrets", async () => {
    const screens: Record<string, string> = {
      t1: `${E}[32mdone${E}[0m\nexport API_TOKEN=abcd1234efgh\n\n`,
      t2: "plain",
    };
    await keepLastLines([term("t1"), term("t2")], (id) => (screens[id] ? screen(screens[id]) : null));
    expect(io.save).toHaveBeenCalledTimes(2);
    const t1 = io.save.mock.calls.find(([id]) => id === "t1")![1];
    expect(t1).toContain("38;5;2");
    expect(t1).toContain(`API_TOKEN=${REDACTED}`);
    expect(t1).not.toContain("abcd1234efgh");
  });

  it("stores nothing when the setting is off", async () => {
    usePreferencesStore.setState({ hibernateSaveLines: false });
    await keepLastLines([term("t1")], () => screen("text"));
    expect(io.save).not.toHaveBeenCalled();
  });

  it("keeps the grid of an app on the alternate screen, such as top", async () => {
    const serialized = `old shell line${E}[?1049h${E}[H${E}[7mPID  COMMAND${E}[0m\r\n123  node`;
    await keepLastLines([term("t1")], () => ({ text: serialized, alt: true, rows: 4 }));
    expect(io.save).toHaveBeenCalledTimes(1);
    const stored = io.save.mock.calls[0]![1];
    expect(stored).not.toContain("old shell line");
    expect(stored).toContain("PID  COMMAND");
    expect(stored.split("\n")).toHaveLength(4);
  });

  it("stores nothing for a tab with no screen worth keeping", async () => {
    await keepLastLines([term("t1"), term("t2")], (id) => (id === "t1" ? null : screen("\n\n  \n")));
    expect(io.save).not.toHaveBeenCalled();
  });

  it("does not fail the hibernation when the backend refuses", async () => {
    io.save.mockRejectedValue(new Error("disk full"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(keepLastLines([term("t1")], () => screen("text"))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("useHibernateLinesCleanup", () => {
  beforeEach(() => {
    io.del.mockReset();
    io.del.mockResolvedValue(undefined);
  });

  const sleeping = (...ids: string[]) => applyHibernate([workspace("t1", "t2")], "w1", Object.fromEntries(ids.map((id) => [id, { at: 1 }])));

  it("deletes the lines of a tab that wakes, and only of that one", () => {
    const { rerender } = renderHook(({ ws }) => useHibernateLinesCleanup(ws), { initialProps: { ws: sleeping("t1", "t2") } });
    expect(io.del).not.toHaveBeenCalled();
    rerender({ ws: applyWake(sleeping("t1", "t2"), "w1", new Set(["t1"])) });
    expect(io.del).toHaveBeenCalledTimes(1);
    expect(io.del).toHaveBeenCalledWith(["t1"]);
  });

  it("keeps the lines of a sleeping tab that is closed, with its workspace or alone, so undoing the close finds them", () => {
    const { rerender } = renderHook(({ ws }) => useHibernateLinesCleanup(ws), { initialProps: { ws: sleeping("t1", "t2") } });
    rerender({ ws: [workspace("t2")].map((w) => applyHibernate([w], "w1", { t2: { at: 1 } })[0]!) });
    rerender({ ws: [] });
    expect(io.del).not.toHaveBeenCalled();
  });

  it("does nothing when a tab starts to sleep", () => {
    const { rerender } = renderHook(({ ws }) => useHibernateLinesCleanup(ws), { initialProps: { ws: [workspace("t1")] } });
    rerender({ ws: applyHibernate([workspace("t1")], "w1", { t1: { at: 1 } }) });
    expect(io.del).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  runCloseQueue,
  type CloseQueueDeps,
  type CloseQueuePanel,
} from "./closeQueue";

type Panels = Record<string, CloseQueuePanel>;

function makeDeps(
  panels: Panels,
  overrides: Partial<CloseQueueDeps> = {},
): { deps: CloseQueueDeps; closed: string[]; saved: string[]; warnSet: boolean[] } {
  const closed: string[] = [];
  const saved: string[] = [];
  const warnSet: boolean[] = [];
  const deps: CloseQueueDeps = {
    getPanel: (id) => panels[id] ?? null,
    hasForegroundProcess: async () => null,
    isWarnEnabled: () => true,
    setWarnEnabled: async (v) => {
      warnSet.push(v);
    },
    isAutoSaveEnabled: () => false,
    askTerminalClose: async () => ({ type: "close", dontAskAgain: false }),
    askEditorClose: async () => ({ type: "save" }),
    saveTab: async (id) => {
      saved.push(id);
    },
    closeTab: (id) => {
      closed.push(id);
    },
    ...overrides,
  };
  return { deps, closed, saved, warnSet };
}

describe("runCloseQueue", () => {
  it("closes a clean terminal without asking", async () => {
    const { deps, closed } = makeDeps({ a: { kind: "terminal" } });
    await runCloseQueue(["a"], deps);
    expect(closed).toEqual(["a"]);
  });

  it("skips locked terminals", async () => {
    const { deps, closed } = makeDeps({ a: { kind: "terminal", locked: true } });
    await runCloseQueue(["a"], deps);
    expect(closed).toEqual([]);
  });

  it("does not ask when the warning setting is off", async () => {
    const ask = vi.fn(async () => ({ type: "close", dontAskAgain: false }) as const);
    const { deps, closed } = makeDeps(
      { a: { kind: "terminal" } },
      { isWarnEnabled: () => false, hasForegroundProcess: async () => "npm", askTerminalClose: ask },
    );
    await runCloseQueue(["a"], deps);
    expect(ask).not.toHaveBeenCalled();
    expect(closed).toEqual(["a"]);
  });

  it("asks for a busy terminal and closes on confirm", async () => {
    const { deps, closed } = makeDeps(
      { a: { kind: "terminal" } },
      { hasForegroundProcess: async () => "npm" },
    );
    await runCloseQueue(["a"], deps);
    expect(closed).toEqual(["a"]);
  });

  it("cancel on a busy terminal stops the whole queue", async () => {
    const { deps, closed } = makeDeps(
      { a: { kind: "terminal" }, b: { kind: "terminal" } },
      {
        hasForegroundProcess: async () => "npm",
        askTerminalClose: async () => ({ type: "cancel" }),
      },
    );
    await runCloseQueue(["a", "b"], deps);
    expect(closed).toEqual([]);
  });

  it("dont-ask-again disables the setting and closes the rest silently", async () => {
    const ask = vi.fn(async () => ({ type: "close", dontAskAgain: true }) as const);
    const { deps, closed, warnSet } = makeDeps(
      { a: { kind: "terminal" }, b: { kind: "terminal" } },
      { hasForegroundProcess: async () => "npm", askTerminalClose: ask },
    );
    await runCloseQueue(["a", "b"], deps);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(warnSet).toEqual([false]);
    expect(closed).toEqual(["a", "b"]);
  });

  it("skips locked editors without asking", async () => {
    const ask = vi.fn();
    const { deps, closed } = makeDeps(
      { a: { kind: "editor", dirty: true, locked: true } },
      { askEditorClose: ask as never },
    );
    await runCloseQueue(["a"], deps);
    expect(ask).not.toHaveBeenCalled();
    expect(closed).toEqual([]);
  });

  it("saves a dirty editor on save then closes", async () => {
    const { deps, closed, saved } = makeDeps(
      { a: { kind: "editor", dirty: true } },
      { askEditorClose: async () => ({ type: "save" }) },
    );
    await runCloseQueue(["a"], deps);
    expect(saved).toEqual(["a"]);
    expect(closed).toEqual(["a"]);
  });

  it("dont-save closes a dirty editor without saving", async () => {
    const { deps, closed, saved } = makeDeps(
      { a: { kind: "editor", dirty: true } },
      { askEditorClose: async () => ({ type: "dont-save" }) },
    );
    await runCloseQueue(["a"], deps);
    expect(saved).toEqual([]);
    expect(closed).toEqual(["a"]);
  });

  it("with autosave on, saves a dirty editor silently and closes", async () => {
    const ask = vi.fn();
    const { deps, closed, saved } = makeDeps(
      { a: { kind: "editor", dirty: true } },
      { isAutoSaveEnabled: () => true, askEditorClose: ask as never },
    );
    await runCloseQueue(["a"], deps);
    expect(ask).not.toHaveBeenCalled();
    expect(saved).toEqual(["a"]);
    expect(closed).toEqual(["a"]);
  });

  it("with autosave on, a failed save throws and does not close the tab", async () => {
    const { deps, closed } = makeDeps(
      { a: { kind: "editor", dirty: true } },
      {
        isAutoSaveEnabled: () => true,
        saveTab: async () => {
          throw new Error("write failed");
        },
      },
    );
    await expect(runCloseQueue(["a"], deps)).rejects.toThrow("write failed");
    expect(closed).toEqual([]);
  });

  it("cancel on a dirty editor stops the queue", async () => {
    const { deps, closed } = makeDeps(
      { a: { kind: "editor", dirty: true }, b: { kind: "terminal" } },
      { askEditorClose: async () => ({ type: "cancel" }) },
    );
    await runCloseQueue(["a", "b"], deps);
    expect(closed).toEqual([]);
  });

  it("closes a clean editor without asking", async () => {
    const ask = vi.fn();
    const { deps, closed } = makeDeps(
      { a: { kind: "editor", dirty: false } },
      { askEditorClose: ask as never },
    );
    await runCloseQueue(["a"], deps);
    expect(ask).not.toHaveBeenCalled();
    expect(closed).toEqual(["a"]);
  });

  it("a failed save throws and does not close the tab", async () => {
    const { deps, closed } = makeDeps(
      { a: { kind: "editor", dirty: true } },
      {
        askEditorClose: async () => ({ type: "save" }),
        saveTab: async () => {
          throw new Error("write failed");
        },
      },
    );
    await expect(runCloseQueue(["a"], deps)).rejects.toThrow("write failed");
    expect(closed).toEqual([]);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  runCloseQueue,
  type CloseQueueDeps,
  type CloseQueueTab,
} from "./closeQueue";

type Tabs = Record<string, CloseQueueTab>;

function makeDeps(
  tabs: Tabs,
  overrides: Partial<CloseQueueDeps> = {},
): { deps: CloseQueueDeps; closed: string[]; saved: string[] } {
  const closed: string[] = [];
  const saved: string[] = [];
  const deps: CloseQueueDeps = {
    getTab: (id) => tabs[id] ?? null,
    hasBusyAgent: () => false,
    isAutoSaveEnabled: () => false,
    askTerminalClose: async () => ({ type: "close" }),
    askEditorClose: async () => ({ type: "save" }),
    saveTab: async (id) => {
      saved.push(id);
    },
    reportSaveError: () => {},
    closeTab: (id) => {
      closed.push(id);
    },
    ...overrides,
  };
  return { deps, closed, saved };
}

describe("runCloseQueue terminals", () => {
  it("closes a clean terminal without asking", async () => {
    const ask = vi.fn();
    const { deps, closed } = makeDeps({ a: { kind: "terminal" } }, { askTerminalClose: ask as never });
    await runCloseQueue(["a"], deps);
    expect(ask).not.toHaveBeenCalled();
    expect(closed).toEqual(["a"]);
  });

  it("skips locked terminals", async () => {
    const { deps, closed } = makeDeps({ a: { kind: "terminal", locked: true } });
    await runCloseQueue(["a"], deps);
    expect(closed).toEqual([]);
  });

  it("asks about a working agent and closes on confirm", async () => {
    const ask = vi.fn(async () => ({ type: "close" }) as const);
    const { deps, closed } = makeDeps({ a: { kind: "terminal" } }, { hasBusyAgent: () => true, askTerminalClose: ask });
    await runCloseQueue(["a"], deps);
    expect(ask).toHaveBeenCalledWith("a");
    expect(closed).toEqual(["a"]);
  });

  it("cancel on a working agent stops the whole queue and reports it", async () => {
    const { deps, closed } = makeDeps(
      { a: { kind: "terminal" }, b: { kind: "terminal" } },
      { hasBusyAgent: () => true, askTerminalClose: async () => ({ type: "cancel" }) },
    );
    const allClosed = await runCloseQueue(["a", "b"], deps);
    expect(closed).toEqual([]);
    expect(allClosed).toBe(false);
  });

  it("asks about every working agent of a bulk close, one after the other", async () => {
    const ask = vi.fn(async () => ({ type: "close" }) as const);
    const { deps, closed } = makeDeps(
      { a: { kind: "terminal" }, b: { kind: "terminal" }, c: { kind: "terminal" } },
      { hasBusyAgent: (id) => id !== "b", askTerminalClose: ask },
    );
    await runCloseQueue(["a", "b", "c"], deps);
    expect(ask.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["a", "c"]);
    expect(closed).toEqual(["a", "b", "c"]);
  });

  it("never asks about a sleeping terminal, even if an agent is reported busy", async () => {
    const ask = vi.fn();
    const { deps, closed } = makeDeps(
      { a: { kind: "terminal", hibernated: true } },
      { hasBusyAgent: () => true, askTerminalClose: ask as never },
    );
    await runCloseQueue(["a"], deps);
    expect(ask).not.toHaveBeenCalled();
    expect(closed).toEqual(["a"]);
  });

  it("reports true when every tab closes without cancelling", async () => {
    const { deps } = makeDeps({ a: { kind: "terminal" }, b: { kind: "editor", dirty: false } });
    expect(await runCloseQueue(["a", "b"], deps)).toBe(true);
  });
});

describe("runCloseQueue editors", () => {
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
    const { deps, closed } = makeDeps({ a: { kind: "editor", dirty: false } }, { askEditorClose: ask as never });
    await runCloseQueue(["a"], deps);
    expect(ask).not.toHaveBeenCalled();
    expect(closed).toEqual(["a"]);
  });

  it("asks before closing a dirty markdown tab, same as a dirty editor tab", async () => {
    const ask = vi.fn(async () => ({ type: "save" }) as const);
    const { deps, closed, saved } = makeDeps(
      { a: { kind: "markdown", dirty: true } },
      { isAutoSaveEnabled: () => false, askEditorClose: ask },
    );
    const allClosed = await runCloseQueue(["a"], deps);
    expect(ask).toHaveBeenCalledWith("a");
    expect(saved).toEqual(["a"]);
    expect(closed).toEqual(["a"]);
    expect(allClosed).toBe(true);
  });

  it("cancelling the close of a dirty markdown tab stops the whole run", async () => {
    const { deps, closed } = makeDeps(
      { a: { kind: "markdown", dirty: true }, b: { kind: "editor", dirty: false } },
      { askEditorClose: async () => ({ type: "cancel" }) },
    );
    const allClosed = await runCloseQueue(["a", "b"], deps);
    expect(closed).toEqual([]);
    expect(allClosed).toBe(false);
  });

  it("closes a clean markdown tab without asking", async () => {
    const ask = vi.fn();
    const { deps, closed } = makeDeps({ a: { kind: "markdown", dirty: false } }, { askEditorClose: ask as never });
    await runCloseQueue(["a"], deps);
    expect(ask).not.toHaveBeenCalled();
    expect(closed).toEqual(["a"]);
  });

  it("keeps a dirty tab open and reports when saving fails", async () => {
    const reported: unknown[] = [];
    const err = new Error("conflict");
    for (const autoSave of [true, false]) {
      const { deps, closed } = makeDeps(
        { a: { kind: "editor", dirty: true }, b: { kind: "terminal" } },
        {
          isAutoSaveEnabled: () => autoSave,
          saveTab: async () => {
            throw err;
          },
          reportSaveError: (_id, e) => reported.push(e),
        },
      );
      expect(await runCloseQueue(["a", "b"], deps)).toBe(false);
      expect(closed).toEqual([]);
    }
    expect(reported).toEqual([err, err]);
  });
});

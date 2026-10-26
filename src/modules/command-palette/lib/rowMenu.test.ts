import { describe, expect, it } from "vitest";
import type { ClosedTabEntry } from "./closedEntries";
import type { MergedRow } from "./mergeRows";
import {
  actionMenuItems,
  closedMenuItems,
  folderMenuItems,
  highlightedClosedOf,
  placeMenuLeft,
  placeMenuTop,
  stepEnabled,
  tabMenuItems,
} from "./rowMenu";
import type { TabEntry } from "./tabEntries";

const entry = (over: Partial<TabEntry> & { locked?: boolean } = {}): TabEntry =>
  ({
    tabId: "tab-1",
    kind: "terminal",
    cwd: "/repo",
    detail: "/repo",
    hibernated: false,
    agentSession: undefined,
    tab: { id: "tab-1", kind: "terminal", cwd: "/repo", locked: over.locked },
    ...over,
  }) as TabEntry;

describe("tabMenuItems", () => {
  it("offers go, terminal, copy and close with their shortcuts", () => {
    const items = tabMenuItems(entry());
    expect(items.map((i) => i.id)).toEqual(["go", "terminal", "copy", "close"]);
    expect(items[0]).toMatchObject({ label: "Go to Tab", enter: true });
    expect(items[1].shortcutId).toBe("tab.new");
    expect(items[2].shortcutId).toBe("path.copy");
    expect(items[3].shortcutId).toBe("tab.close");
    expect(items.every((i) => !i.disabled)).toBe(true);
  });

  it("says restore for a hibernated tab and can still close it", () => {
    const items = tabMenuItems(entry({ hibernated: true }));
    expect(items[0].label).toBe("Restore and go to Tab");
    expect(items[3].disabled).toBeFalsy();
  });

  it("cannot close a locked tab", () => {
    expect(tabMenuItems(entry({ locked: true }))[3].disabled).toBe(true);
  });

  it("disables the terminal without a folder and the copy without a path", () => {
    const items = tabMenuItems(
      entry({
        cwd: "",
        kind: "git-history",
        tab: { id: "t", kind: "git-history" } as TabEntry["tab"],
      }),
    );
    expect(items[1].disabled).toBe(true);
    expect(items[2].disabled).toBe(true);
  });
});

describe("folderMenuItems", () => {
  it("lists the worktrees action only for a repository", () => {
    expect(folderMenuItems({ path: "/a/b", worktrees: null }).map((i) => i.id)).toEqual([
      "pick",
      "copy",
    ]);
    const items = folderMenuItems({ path: "/a/b", worktrees: { kind: "show", count: 2 } });
    expect(items.map((i) => i.id)).toEqual(["pick", "worktrees", "copy"]);
    expect(items[0].label).toBe("New Tab in b");
    expect(items[1]).toMatchObject({ label: "Show 2 worktrees", shortcutId: "tab.new" });
    expect(folderMenuItems({ path: "/a/b", worktrees: { kind: "hide" } })[1].label).toBe(
      "Hide worktrees",
    );
  });

  it("ends with the Actions that run in the folder, the first one under a rule", () => {
    const items = folderMenuItems({
      path: "/a/b",
      worktrees: null,
      actions: [
        { id: "g1", label: "Claude Code", title: "Claude Code in /a/b" },
        { id: "s1", label: "Dev server", title: null },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["pick", "copy", "action", "action"]);
    expect(items[2]).toMatchObject({ actionId: "g1", label: "Claude Code", separatorBefore: true });
    expect(items[3]).toMatchObject({ actionId: "s1" });
    expect(items[3].separatorBefore).toBeUndefined();
  });
});

describe("stepEnabled", () => {
  const items = [{ disabled: false }, { disabled: true }, { disabled: false }] as never[];
  it("skips disabled items and wraps", () => {
    expect(stepEnabled(items, 0, 1)).toBe(2);
    expect(stepEnabled(items, 2, 1)).toBe(0);
    expect(stepEnabled(items, 0, -1)).toBe(2);
    expect(stepEnabled([{ disabled: true }] as never[], 0, 1)).toBe(-1);
  });
});

describe("placeMenuTop", () => {
  it("goes below the row when it fits", () => {
    expect(placeMenuTop({ rowTop: 100, rowBottom: 130 }, 400, 120)).toBe(132);
  });
  it("flips above when it does not fit below", () => {
    expect(placeMenuTop({ rowTop: 150, rowBottom: 180 }, 200, 120)).toBe(28);
  });
  it("pins to the bottom edge when it fits in neither", () => {
    expect(placeMenuTop({ rowTop: 20, rowBottom: 50 }, 150, 120)).toBe(30);
  });
});

const closed = (path: string): ClosedTabEntry => ({ key: `closed:terminal:${path}`, path }) as ClosedTabEntry;

describe("closedMenuItems", () => {
  it("offers reopen with Enter and copy path", () => {
    const items = closedMenuItems(closed("/repo"));
    expect(items.map((i) => i.id)).toEqual(["go", "copy"]);
    expect(items[0]).toMatchObject({ label: "Reopen Closed Tab", enter: true });
    expect(items[1].disabled).toBe(false);
  });
});

describe("highlightedClosedOf", () => {
  const rows = [{ kind: "closed", key: "k", entry: closed("/repo") }] as MergedRow[];

  it("finds the closed entry by its row key", () => {
    expect(highlightedClosedOf("closed:terminal:/repo", rows)?.path).toBe("/repo");
  });

  it("ignores other keys and live tabs", () => {
    expect(highlightedClosedOf("tab:tab-1", rows)).toBeNull();
  });
});

describe("placeMenuLeft", () => {
  it("hangs the menu from the pointer", () => {
    expect(placeMenuLeft(100, 500, 200)).toBe(100);
  });

  it("keeps the menu inside the box on the right edge", () => {
    expect(placeMenuLeft(450, 500, 200)).toBe(300);
  });

  it("never goes past the left edge", () => {
    expect(placeMenuLeft(-5, 500, 200)).toBe(0);
    expect(placeMenuLeft(10, 100, 200)).toBe(0);
  });
});

describe("actionMenuItems", () => {
  const base = { state: "idle", stoppable: false, action: { kind: "script" } };

  it("offers Run with Enter, then Edit", () => {
    const items = actionMenuItems(base as never);
    expect(items.map((i) => i.id)).toEqual(["run", "edit"]);
    expect(items[0]).toMatchObject({ label: "Run", enter: true });
  });

  it("says Open for an app", () => {
    expect(actionMenuItems({ ...base, action: { kind: "app" } } as never)[0].label).toBe("Open");
  });

  it("says Run for an agent", () => {
    expect(actionMenuItems({ ...base, action: { kind: "agent" } } as never)[0].label).toBe("Run");
  });

  it("adds Stop and turns Run into Show script while the script runs", () => {
    const items = actionMenuItems({ ...base, state: "running", stoppable: true } as never);
    expect(items.map((i) => i.id)).toEqual(["run", "stop", "edit"]);
    expect(items[0].label).toBe("Show script");
  });
});

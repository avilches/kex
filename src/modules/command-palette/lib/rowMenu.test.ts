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
  workspaceIdOfRow,
  workspaceMenuItems,
  workspaceRowKeys,
} from "./rowMenu";
import type { TabEntry, WorkspaceEntry } from "./tabEntries";

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
    expect(items.map((i) => i.id)).toEqual([
      "go",
      "terminal",
      "copy",
      "close",
      "closeWorkspace",
    ]);
    expect(items[4]).toMatchObject({ label: "Close Workspace", shortcutId: "workspace.close" });
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
        { id: "g1", label: "Claude Code", title: "Claude Code in /a/b", scope: "global" },
        { id: "s1", label: "Dev server", title: null, scope: "global" },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["pick", "copy", "action", "action"]);
    expect(items[2]).toMatchObject({ actionId: "g1", label: "Claude Code", separatorBefore: true });
    expect(items[3]).toMatchObject({ actionId: "s1" });
    expect(items[3].separatorBefore).toBeUndefined();
    expect(items[2].heading).toBeUndefined();
  });

  it("titles each scope, like the Header combo, only when both are present", () => {
    const items = folderMenuItems({
      path: "/a/b",
      worktrees: null,
      actions: [
        { id: "w1", label: "Dev", title: null, scope: "workspace" },
        { id: "w2", label: "Test", title: null, scope: "workspace" },
        { id: "g1", label: "Claude", title: null, scope: "global" },
      ],
    });
    expect(items[2]).toMatchObject({ actionId: "w1", heading: "Workspace actions", separatorBefore: true });
    expect(items[3].heading).toBeUndefined();
    expect(items[4]).toMatchObject({ actionId: "g1", heading: "Global actions", separatorBefore: true });
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

const wsEntry = (over: Partial<WorkspaceEntry> = {}): WorkspaceEntry => ({
  workspaceId: "ws-1",
  title: "Kex",
  color: null,
  icon: null,
  tabCount: 2,
  root: "/repo",
  canHibernate: true,
  lastUsedAt: 0,
  ...over,
});

describe("workspaceMenuItems", () => {
  it("offers the actions of the workspace bar menu that need no pointer, with their shortcuts", () => {
    const items = workspaceMenuItems(wsEntry());
    expect(items.map((i) => i.id)).toEqual([
      "go",
      "terminal",
      "rename",
      "hibernate",
      "closeTabs",
      "closeWorkspace",
      "settings",
    ]);
    const shortcut = (id: string) => items.find((i) => i.id === id)?.shortcutId;
    expect(shortcut("rename")).toBe("workspace.rename");
    expect(shortcut("closeWorkspace")).toBe("workspace.close");
    expect(shortcut("settings")).toBe("workspace.settings");
    expect(items.find((i) => i.id === "settings")?.separatorBefore).toBe(true);
  });

  it("leaves out hibernate when nothing is awake, close all tabs when it has none and the terminal without a root", () => {
    const ids = workspaceMenuItems(wsEntry({ canHibernate: false, tabCount: 0, root: null })).map(
      (i) => i.id,
    );
    expect(ids).toEqual(["go", "rename", "closeWorkspace", "settings"]);
  });
});

describe("workspaceIdOfRow and workspaceRowKeys", () => {
  const tabRow = (id: string, workspaceId: string) =>
    ({ kind: "tab", key: `tab:${id}`, entry: { tabId: id, workspaceId } }) as unknown as MergedRow;
  const wsRow = (id: string) =>
    ({ kind: "workspace", key: `ws:${id}`, entry: wsEntry({ workspaceId: id }) }) as MergedRow;
  const cmdRow = { kind: "command", key: "cmd:x", item: {} } as unknown as MergedRow;
  const rows = [tabRow("a", "w1"), tabRow("b", "w2"), wsRow("w2"), tabRow("c", "w2"), cmdRow];

  it("resolves a workspace row to itself and a tab row to the workspace holding it", () => {
    expect(workspaceIdOfRow("ws:w2", rows)).toBe("w2");
    expect(workspaceIdOfRow("tab:a", rows)).toBe("w1");
  });

  it("resolves nothing for rows without a workspace or an unknown value", () => {
    expect(workspaceIdOfRow("cmd:x", rows)).toBeNull();
    expect(workspaceIdOfRow("", rows)).toBeNull();
  });

  it("collects the workspace row and every tab row of the workspace", () => {
    expect([...workspaceRowKeys(rows, "w2")].sort()).toEqual(["tab:b", "tab:c", "ws:w2"]);
    expect(workspaceRowKeys(rows, "w9").size).toBe(0);
  });
});

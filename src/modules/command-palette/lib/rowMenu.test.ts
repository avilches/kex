import { describe, expect, it } from "vitest";
import type { ClosedTabEntry } from "./closedEntries";
import type { MergedRow } from "./mergeRows";
import {
  actionMenuItems,
  closedCopyOptions,
  closedCopySubmenuItems,
  closedMenuItems,
  folderMenuItems,
  highlightedClosedOf,
  moveMenuItems,
  type RowMenuItemId,
  runnableTabItem,
  tabCopyOptions,
  tabCopySubmenuItems,
  tabItemKeepsPalette,
  placeMenuLeft,
  placeMenuTop,
  stepEnabled,
  tabMenuItems,
  workspaceIdOfRow,
  workspaceMenuItems,
  workspaceRowKeys,
} from "./rowMenu";
import type { TabEntry, WorkspaceEntry } from "./tabEntries";



// A tab entry whose live tab is built from `tab`; the entry mirrors what buildTabEntries derives from it.
const entry = (tab: Record<string, unknown> = {}, over: Partial<TabEntry> = {}): TabEntry => {
  const full = { id: "tab-1", kind: "terminal", cwd: "/repo", ...tab } as TabEntry["tab"];
  return {
    tabId: full.id,
    workspaceId: "ws-1",
    workspaceRoot: "/repo",
    kind: full.kind,
    cwd: "cwd" in full ? (full.cwd ?? "") : "",
    detail: "/repo",
    hibernated: full.kind === "terminal" && !!full.hibernation,
    agentSession: undefined,
    tab: full,
    ...over,
  } as TabEntry;
};

const ids = (e: TabEntry) => tabMenuItems(e).map((i) => i.id);
const item = (e: TabEntry, id: RowMenuItemId) => tabMenuItems(e).find((i) => i.id === id);

describe("tabMenuItems", () => {
  it("does not offer Focus on Sidebar nor Close Other Tabs", () => {
    const all = ids(entry({ cwd: "/repo/sub" })) as string[];
    expect(all).not.toContain("focusSidebar");
    expect(all).not.toContain("closeOthers");
  });

  it("offers the actions of the real tab menu on a terminal, in order", () => {
    expect(ids(entry({ cwd: "/repo/sub" }))).toEqual([
      "go",
      "terminal",
      "note",
      "copyPath",
      "moveWorkspace",
      "hibernateTab",
      "tabId",
      "lock",
      "close",
    ]);
  });

  it("does not offer closing the workspace: the user could not tell which one it is", () => {
    expect(ids(entry())).not.toContain("closeWorkspace");
  });

  it("carries the shortcut of every item that has a twin", () => {
    const e = entry({ note: "x" });
    const shortcutOf = (id: RowMenuItemId) => item(e, id)?.shortcutId;
    expect(shortcutOf("terminal")).toBe("tab.new");
    expect(shortcutOf("note")).toBe("tab.note");
    expect(shortcutOf("copy")).toBe("path.copy");
    expect(shortcutOf("hibernateTab")).toBe("tab.hibernate");
    expect(shortcutOf("lock")).toBe("tab.lock");
    expect(shortcutOf("close")).toBe("tab.close");
    expect(item(entry({ kind: "editor", path: "/repo/a.ts", dirty: true }), "save")?.shortcutId).toBe(
      "editor.save",
    );
    expect(item(e, "go")).toMatchObject({ label: "Go to Tab", enter: true });
  });

  it("flips lock and hibernate labels with the state of the tab", () => {
    expect(item(entry(), "lock")).toMatchObject({ label: "Lock Tab", active: false });
    expect(item(entry({ locked: true }), "lock")).toMatchObject({ label: "Unlock Tab", active: true });
    expect(item(entry(), "hibernateTab")).toMatchObject({ label: "Hibernate Tab" });
  });

  it("offers a sleeping tab Restore Tab in the slot of Hibernate Tab, next to Restore and go to Tab", () => {
    const asleep = entry({ hibernation: { at: 1 } });
    expect(item(asleep, "go")?.label).toBe("Restore and go to Tab");
    expect(item(asleep, "restoreTab")).toMatchObject({ label: "Restore Tab", shortcutId: "tab.hibernate" });
    expect(ids(asleep)).not.toContain("hibernateTab");
    expect(ids(asleep).indexOf("restoreTab")).toBe(ids(entry()).indexOf("hibernateTab"));
  });

  it("runs Restore Tab for the hibernate key on a sleeping row, and Hibernate Tab on an awake one", () => {
    const asleep = entry({ hibernation: { at: 1 } });
    expect(runnableTabItem(asleep, "hibernateTab")?.id).toBe("restoreTab");
    expect(runnableTabItem(entry(), "hibernateTab")?.id).toBe("hibernateTab");
  });

  it("only offers hibernation and restore on terminals", () => {
    expect(ids(entry({ kind: "editor", path: "/repo/a.ts", dirty: false }))).not.toContain("hibernateTab");
    expect(ids(entry({ kind: "browser", url: "https://a.b" }))).not.toContain("hibernateTab");
  });

  it("cannot close a locked tab but can still lock-toggle it", () => {
    const locked = entry({ locked: true });
    expect(item(locked, "close")?.disabled).toBe(true);
    expect(item(locked, "lock")?.disabled).toBeFalsy();
    expect(item(entry(), "close")?.disabled).toBeFalsy();
  });

  it("offers Save only on a dirty editor or markdown tab", () => {
    expect(ids(entry({ kind: "editor", path: "/repo/a.ts", dirty: true }))).toContain("save");
    expect(ids(entry({ kind: "editor", path: "/repo/a.ts", dirty: false }))).not.toContain("save");
    expect(ids(entry({ kind: "markdown", path: "/repo/a.md", dirty: true }))).toContain("save");
    expect(ids(entry({ kind: "markdown", path: "/repo/a.md" }))).not.toContain("save");
    expect(ids(entry())).not.toContain("save");
  });

  it("says add, show or hide for the note and offers removing one that exists", () => {
    expect(item(entry(), "note")?.label).toBe("Add Note");
    expect(ids(entry())).not.toContain("removeNote");
    const hidden = entry({ note: "hi" });
    expect(item(hidden, "note")?.label).toBe("Show Note");
    expect(ids(hidden)).toContain("removeNote");
    const open = entry({ note: "hi", noteOpen: true });
    expect(item(open, "note")?.label).toBe("Hide Note");
    expect(ids(open)).toContain("removeNote");
  });

  it("groups the copies under Copy Path when the row has more than its absolute path", () => {
    const inside = entry({ kind: "editor", path: "/repo/src/a.ts", dirty: false }, { repoRoot: "/repo/src" });
    expect(ids(inside)).toContain("copyPath");
    expect(ids(inside)).not.toContain("copy");
    expect(tabCopySubmenuItems(inside).map((i) => [i.id, i.detail])).toEqual([
      ["back", undefined],
      ["copy", "/repo/src/a.ts"],
      ["copyWorkspace", "src/a.ts"],
      ["copyRepository", "a.ts"],
    ]);
    expect(tabCopySubmenuItems(inside).find((i) => i.id === "copy")?.shortcutId).toBe("path.copy");
  });

  it("is a plain Copy Absolute Path when no other base applies", () => {
    for (const e of [
      entry({ kind: "editor", path: "/other/a.ts", dirty: false }),
      entry({}, { workspaceRoot: null }),
      entry({ cwd: "/repo" }),
      entry({ kind: "browser", url: "https://a.b" }, { detail: "https://a.b" }),
    ]) {
      expect(ids(e)).toContain("copy");
      expect(ids(e)).not.toContain("copyPath");
    }
  });

  it("copies a url as it is, without a workspace or repository path", () => {
    const browser = entry({ kind: "browser", url: "https://a.b" }, { detail: "https://a.b", repoRoot: "/repo" });
    expect(tabCopyOptions(browser).map((o) => o.kind)).toEqual(["absolute"]);
  });

  it("shows the path to copy as a second line, and nothing when the item is disabled", () => {
    const inside = entry({ kind: "editor", path: "/repo/src/a.ts", dirty: false }, { workspaceRoot: null });
    expect(item(inside, "copy")?.detail).toBe("/repo/src/a.ts");
    const none = entry({ kind: "git-history", repoRoot: "/r" }, { cwd: "" });
    expect(item(none, "copy")?.detail).toBeUndefined();
    expect(item(entry(), "tabId")?.detail).toBeUndefined();
  });

  it("copies the tab id and shows it as the tooltip", () => {
    expect(item(entry(), "tabId")).toMatchObject({ label: "Copy Tab ID", value: "tab-1", title: "tab-1" });
  });

  it("disables the terminal without a folder and the copy without a path", () => {
    const e = entry({ kind: "git-history", repoRoot: "/r" }, { cwd: "" });
    expect(item(e, "terminal")?.disabled).toBe(true);
    expect(item(e, "copy")?.disabled).toBe(true);
    expect(ids(e)).not.toContain("copyPath");
  });

  it("always offers moving the tab to another workspace", () => {
    for (const t of [{}, { kind: "browser", url: "u" }, { kind: "git-history", repoRoot: "/r" }]) {
      expect(ids(entry(t))).toContain("moveWorkspace");
    }
  });
});

describe("tabItemKeepsPalette", () => {
  it("keeps the palette for the toggles that change the row in place", () => {
    for (const id of ["lock", "hibernateTab", "save", "removeNote", "copy", "copyPath", "copyWorkspace", "copyRepository", "tabId"] as const) {
      expect(tabItemKeepsPalette(id, entry())).toBe(true);
    }
  });

  it("keeps it when the note item hides an open note", () => {
    expect(tabItemKeepsPalette("note", entry({ note: "hi", noteOpen: true }))).toBe(true);
  });

  it("closes it when the note item adds or shows a note, because the note takes the focus", () => {
    expect(tabItemKeepsPalette("note", entry())).toBe(false);
    expect(tabItemKeepsPalette("note", entry({ note: "hi" }))).toBe(false);
  });

  it("closes it for the rest", () => {
    for (const id of ["go", "close"] as const) {
      expect(tabItemKeepsPalette(id, entry())).toBe(false);
    }
  });
});

describe("runnableTabItem", () => {
  it("finds the item a shortcut would run", () => {
    expect(runnableTabItem(entry(), "lock")?.id).toBe("lock");
  });

  it("is null when the menu does not offer the item on that tab", () => {
    expect(runnableTabItem(entry(), "save")).toBeNull();
    expect(runnableTabItem(entry({ kind: "browser", url: "u" }), "hibernateTab")).toBeNull();
  });

  it("is null for a disabled item, except Close so a locked tab still flashes", () => {
    expect(runnableTabItem(entry({ kind: "git-history", repoRoot: "/r" }, { cwd: "" }), "terminal")).toBeNull();
    expect(runnableTabItem(entry({ locked: true }), "close")?.id).toBe("close");
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
    expect(items[0]).toMatchObject({ label: "Open in Terminal", title: "/a/b" });
    expect(items[1]).toMatchObject({ label: "Show 2 worktrees", shortcutId: "palette.worktrees" });
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

describe("moveMenuItems", () => {
  const ws = (id: string) => ({ workspaceId: id, title: id.toUpperCase(), color: "#fff", icon: "star" });

  it("lists Back, New workspace and the other workspaces in order, the source left out", () => {
    const items = moveMenuItems([ws("a"), ws("b"), ws("c")], "b");
    expect(items.map((i) => [i.id, i.label])).toEqual([
      ["back", "Back"],
      ["moveNew", "New workspace"],
      ["moveTarget", "A"],
      ["moveTarget", "C"],
    ]);
    expect(items.filter((i) => i.targetId).map((i) => i.targetId)).toEqual(["a", "c"]);
  });

  it("numbers the destinations from 1 and leaves Back and New workspace without a digit", () => {
    const items = moveMenuItems([ws("a"), ws("b")], "none");
    expect(items.map((i) => i.digit)).toEqual([undefined, undefined, 1, 2]);
  });

  it("gives a digit to the first nine destinations only", () => {
    const many = Array.from({ length: 12 }, (_, i) => ws(`w${i}`));
    const digits = moveMenuItems(many, "none").filter((i) => i.targetId).map((i) => i.digit);
    expect(digits).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, undefined, undefined, undefined]);
  });

  it("carries the workspace identity for the mark", () => {
    const [, , first] = moveMenuItems([ws("a")], "x");
    expect(first.leading).toEqual({ workspaceId: "a", color: "#fff", icon: "star" });
  });

  it("offers only Back and New workspace when there is no other workspace", () => {
    expect(moveMenuItems([ws("a")], "a").map((i) => i.id)).toEqual(["back", "moveNew"]);
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

  it("groups the copies under Copy Path when the row has a workspace or repository path", () => {
    const entry = { ...closed("/repo/src/a.ts"), workspaceRoot: "/repo" } as ClosedTabEntry;
    expect(closedMenuItems(entry, "/repo/src").map((i) => i.id)).toEqual(["go", "copyPath"]);
    expect(closedCopySubmenuItems(entry, "/repo/src").map((i) => [i.id, i.detail])).toEqual([
      ["back", undefined],
      ["copy", "/repo/src/a.ts"],
      ["copyWorkspace", "src/a.ts"],
      ["copyRepository", "a.ts"],
    ]);
  });

  it("stays a plain Copy Absolute Path with no root to copy against", () => {
    const outside = { ...closed("/other/a.ts"), workspaceRoot: "/repo" } as ClosedTabEntry;
    expect(closedMenuItems(outside).map((i) => i.id)).toEqual(["go", "copy"]);
    expect(closedCopyOptions(closed("/repo")).map((o) => o.kind)).toEqual(["absolute"]);
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
    ]);
    const shortcut = (id: string) => items.find((i) => i.id === id)?.shortcutId;
    expect(items.find((i) => i.id === "terminal")?.label).toBe("Terminal in Workspace Root");
    expect(shortcut("rename")).toBe("workspace.rename");
    expect(shortcut("closeWorkspace")).toBe("workspace.close");
  });

  it("leaves out hibernate when nothing is awake, close all tabs when it has none and the terminal without a root", () => {
    const ids = workspaceMenuItems(wsEntry({ canHibernate: false, tabCount: 0, root: null })).map(
      (i) => i.id,
    );
    expect(ids).toEqual(["go", "rename", "closeWorkspace"]);
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

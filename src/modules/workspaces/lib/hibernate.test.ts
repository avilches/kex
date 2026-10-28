import { describe, expect, it } from "vitest";
import {
  applyHibernate,
  applyWake,
  awakeTerminalTabs,
  blockedWhileHibernated,
  commandBlockedWhileHibernated,
  departedHibernatedIds,
  editorTabIds,
  hibernatedTabIds,
  isHibernatedTab,
  isPendingStale,
  liveTerminalIds,
  workspaceDialogPending,
  formatHibernatedFor,
  restoreCommandFor,
  tabWorktree,
  saveRestoreCommand,
  terminalTabs,
} from "./hibernate";
import type { SplitNode, Tab, TabHibernation, Workspace } from "./types";

type Terminal = Extract<Tab, { kind: "terminal" }>;

const term = (id: string, over: Partial<Terminal> = {}): Tab => ({
  id,
  kind: "terminal",
  ...over,
});
const editor = (id: string, dirty: boolean): Tab => ({
  id,
  kind: "editor",
  path: `/p/${id}.ts`,
  dirty,
  preview: false,
});
const md = (id: string, dirty: boolean): Tab => ({
  id,
  kind: "markdown",
  path: `/p/${id}.md`,
  dirty,
});

const tree: SplitNode = {
  kind: "split",
  id: "s1",
  orientation: "horizontal",
  dividerPosition: 0.4,
  first: { kind: "pane", id: "p1", tabs: [term("t1"), editor("e1", true), term("t2")], activeTabId: "t1" },
  second: { kind: "pane", id: "p2", tabs: [md("m1", true)], activeTabId: "m1" },
};

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  title: "W",
  paneTree: tree,
  activePaneId: "p1",
  ...over,
});

const snap = (over: Partial<TabHibernation> = {}): TabHibernation => ({ at: 1000, agent: "claude", command: "claude --resume abc", ...over });
const paneTabs = (w: Workspace, which: "first" | "second" = "first") =>
  ((w.paneTree as Extract<SplitNode, { kind: "split" }>)[which] as Extract<SplitNode, { kind: "pane" }>).tabs;

describe("hibernatedTabIds and departedHibernatedIds", () => {
  const sleeping = (...ids: string[]) =>
    applyHibernate([ws()], "w1", Object.fromEntries(ids.map((id) => [id, snap()])));

  it("lists only the terminals that sleep, across workspaces", () => {
    const other = applyHibernate([ws({ id: "w2" })], "w2", { t2: snap() })[0]!;
    expect(hibernatedTabIds([...sleeping("t1"), other])).toEqual(new Set(["t1", "t2"]));
    expect(hibernatedTabIds([ws()])).toEqual(new Set());
  });

  it("reports a tab that woke, and one that is gone with its workspace", () => {
    const before = hibernatedTabIds(sleeping("t1", "t2"));
    expect(departedHibernatedIds(before, hibernatedTabIds(applyWake(sleeping("t1", "t2"), "w1", new Set(["t1"]))))).toEqual(["t1"]);
    expect(departedHibernatedIds(before, new Set())).toEqual(["t1", "t2"]);
  });

  it("reports nothing when a tab only starts to sleep or stays asleep", () => {
    expect(departedHibernatedIds(new Set(), new Set(["t1"]))).toEqual([]);
    expect(departedHibernatedIds(new Set(["t1"]), new Set(["t1"]))).toEqual([]);
  });
});

describe("applyHibernate", () => {
  it("puts the snapshot on the terminal tabs it belongs to and on no other", () => {
    const out = applyHibernate([ws()], "w1", { t1: snap() })[0]!;
    const tabs = paneTabs(out);
    expect((tabs[0] as Terminal).hibernation).toEqual(snap());
    expect("hibernation" in tabs[1]!).toBe(false);
    expect("hibernation" in tabs[2]!).toBe(false);
  });

  it("leaves the workspace and its other tabs untouched", () => {
    const other = ws({ id: "w2" });
    const out = applyHibernate([ws(), other], "w1", { t1: snap() });
    expect(out[1]).toBe(other);
    expect(out[0]!.activePaneId).toBe("p1");
    expect(editorTabIds(out[0]!)).toEqual(["e1", "m1"]);
    expect(paneTabs(out[0]!, "second")[0]).toEqual(md("m1", true));
  });

  it("never flags an editor, a markdown or a browser tab, whatever the snapshots say", () => {
    const out = applyHibernate([ws()], "w1", { e1: snap(), m1: snap() })[0]!;
    expect("hibernation" in paneTabs(out)[1]!).toBe(false);
    expect("hibernation" in paneTabs(out, "second")[0]!).toBe(false);
    expect(paneTabs(out)[1]).toMatchObject({ dirty: true });
  });

  it("keeps the first snapshot of a tab that is already asleep", () => {
    const once = applyHibernate([ws()], "w1", { t1: snap({ at: 1 }) });
    const twice = applyHibernate(once, "w1", { t1: snap({ at: 2 }) });
    expect((paneTabs(twice[0]!)[0] as Terminal).hibernation!.at).toBe(1);
  });

  it("does not touch a workspace that is not the target", () => {
    const only = [ws({ id: "w2" })];
    expect(applyHibernate(only, "w1", { t1: snap() })[0]).toBe(only[0]);
  });
});

describe("applyWake", () => {
  it("removes the sleep from the asked tabs only and keeps everything else", () => {
    const asleep = applyHibernate([ws()], "w1", { t1: snap(), t2: snap() });
    const out = applyWake(asleep, "w1", new Set(["t1"]))[0]!;
    const tabs = paneTabs(out);
    expect("hibernation" in tabs[0]!).toBe(false);
    expect((tabs[2] as Terminal).hibernation).toEqual(snap());
    expect(tabs[0]).toEqual(term("t1"));
  });

  it("leaves other workspaces alone", () => {
    const list = applyHibernate([ws(), ws({ id: "w2" })], "w2", { t1: snap() });
    const out = applyWake(list, "w1", new Set(["t1"]));
    expect(out[1]).toBe(list[1]);
  });
});

describe("isHibernatedTab", () => {
  it("is true only for a terminal that carries the sleep", () => {
    expect(isHibernatedTab(term("a", { hibernation: snap() } as Partial<Terminal>))).toBe(true);
    expect(isHibernatedTab(term("a"))).toBe(false);
    expect(isHibernatedTab(editor("e", false))).toBe(false);
    expect(isHibernatedTab(null)).toBe(false);
    expect(isHibernatedTab(undefined)).toBe(false);
  });
});

describe("tabWorktree", () => {
  const asleep = term("a", { hibernation: snap({ worktreeCwd: "/repo/.claude/worktrees/x" }) } as Partial<Terminal>);

  it("prefers the live session's worktree", () => {
    expect(tabWorktree(asleep, "/repo/.claude/worktrees/y")).toBe("/repo/.claude/worktrees/y");
  });

  it("falls back to the one kept when the tab went to sleep", () => {
    expect(tabWorktree(asleep, null)).toBe("/repo/.claude/worktrees/x");
  });

  it("is null for an awake tab without a session, and for a sleeping one that kept none", () => {
    expect(tabWorktree(term("a"), null)).toBeNull();
    expect(tabWorktree(term("a", { hibernation: snap() } as Partial<Terminal>), undefined)).toBeNull();
    expect(tabWorktree(null, null)).toBeNull();
  });
});

describe("formatHibernatedFor", () => {
  const MIN = 60_000;
  const H = 60 * MIN;
  const D = 24 * H;
  it("shows at most two units", () => {
    expect(formatHibernatedFor(10_000)).toBe("less than a minute");
    expect(formatHibernatedFor(5 * MIN)).toBe("5m");
    expect(formatHibernatedFor(3 * H + 20 * MIN + 59_000)).toBe("3h 20m");
    expect(formatHibernatedFor(2 * D + 4 * H + 30 * MIN)).toBe("2d 4h");
  });

  it("leaves out a zero second unit and survives a negative span", () => {
    expect(formatHibernatedFor(2 * H)).toBe("2h");
    expect(formatHibernatedFor(3 * D)).toBe("3d");
    expect(formatHibernatedFor(-5)).toBe("less than a minute");
  });
});

describe("blockedWhileHibernated", () => {
  it("blocks what acts on a live terminal", () => {
    for (const id of ["terminal.clear", "terminal.scratchpad", "search.focus"] as const) {
      expect(blockedWhileHibernated(id), id).toBe(true);
    }
  });

  it("lets tab, pane, sidebar, explorer and editor shortcuts through: a sleeping tab is still a tab", () => {
    for (const id of ["tab.new", "tab.close", "tab.rename", "tab.next", "pane.splitRight", "sidebar.toggle", "sidebar.showGit", "explorer.search", "view.zenMode"] as const) {
      expect(blockedWhileHibernated(id), id).toBe(false);
    }
  });

  it("lets the toggle itself through, so the tab can be woken from the keyboard", () => {
    expect(blockedWhileHibernated("tab.hibernate")).toBe(false);
  });

  it("lets workspace, window, view and settings shortcuts through", () => {
    for (const id of ["workspace.close", "tab.reopenClosed", "workspace.new", "nav.next", "window.new", "view.zoomIn", "settings.open"] as const) {
      expect(blockedWhileHibernated(id)).toBe(false);
    }
  });
});

describe("commandBlockedWhileHibernated", () => {
  it("blocks the palette commands that act on a live terminal", () => {
    for (const id of ["terminal.clear", "history.open"]) expect(commandBlockedWhileHibernated(id), id).toBe(true);
  });

  it("keeps git, search, sidebar and workspace commands", () => {
    for (const id of ["tab.new", "pane.splitRight", "git.graph", "git.source", "search.content", "workspace.runScripts", "settings.open", "workspace.new"]) {
      expect(commandBlockedWhileHibernated(id), id).toBe(false);
    }
  });
});

describe("tab selectors", () => {
  it("lists terminals and editor-like tabs across the whole tree", () => {
    expect(terminalTabs(ws()).map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(editorTabIds(ws())).toEqual(["e1", "m1"]);
  });

  it("lists only the terminals that are still awake", () => {
    const out = applyHibernate([ws()], "w1", { t1: snap() })[0]!;
    expect(awakeTerminalTabs(out).map((t) => t.id)).toEqual(["t2"]);
    expect(terminalTabs(out)).toHaveLength(2);
  });
});

describe("liveTerminalIds", () => {
  it("leaves out the sleeping terminals, so the sweep disposes their session and frees the render slot", () => {
    const list = [applyHibernate([ws()], "w1", { t1: snap() })[0]!, ws({ id: "w2", paneTree: { kind: "pane", id: "px", tabs: [term("t9")], activeTabId: "t9" } })];
    expect([...liveTerminalIds(list)].sort()).toEqual(["t2", "t9"]);
  });

  it("is back to every terminal once the tab wakes", () => {
    const asleep = applyHibernate([ws()], "w1", { t1: snap() });
    const woken = applyWake(asleep, "w1", new Set(["t1"]));
    expect([...liveTerminalIds(woken)].sort()).toEqual(["t1", "t2"]);
  });

  it("ignores editors and markdown tabs", () => {
    expect(liveTerminalIds([ws({ paneTree: { kind: "pane", id: "p", tabs: [editor("e", false), md("m", false)], activeTabId: "e" } })]).size).toBe(0);
  });
});

describe("restoreCommandFor", () => {
  it("prefers the agent resume command, then the Restore Command, else nothing", () => {
    expect(restoreCommandFor(term("t") as Terminal, { resumeCmd: " claude --resume x " })).toBe("claude --resume x");
    expect(restoreCommandFor(term("t", { persistentCommand: "make" }) as Terminal, null)).toBe("make");
    expect(restoreCommandFor(term("t") as Terminal, null)).toBeUndefined();
  });
});

describe("isPendingStale", () => {
  it("is false without a pending id", () => {
    expect(isPendingStale(null, [{ id: "a" }])).toBe(false);
  });
  it("is false while the pending workspace exists", () => {
    expect(isPendingStale("a", [{ id: "a" }, { id: "b" }])).toBe(false);
  });
  it("is true once the pending workspace is gone", () => {
    expect(isPendingStale("a", [{ id: "b" }])).toBe(true);
  });
});

describe("workspaceDialogPending", () => {
  it("is true while either the hibernate or the close dialog is open", () => {
    expect(workspaceDialogPending(null, undefined)).toBe(false);
    expect(workspaceDialogPending({ workspaceId: "w1", tabIds: ["t1"] }, undefined)).toBe(true);
    expect(workspaceDialogPending(null, "w2")).toBe(true);
  });
});

describe("saveRestoreCommand", () => {
  const none = { running: null, agentResumable: undefined };

  it("stores the running command", () => {
    expect(saveRestoreCommand(term("t1"), { ...none, running: "npm run dev" })).toMatchObject({
      persistentCommand: "npm run dev",
    });
  });

  it("drops a followed command once nothing runs, so a finished command never runs again", () => {
    const tab = term("t1", { persistentCommand: "make deploy" });
    const saved = saveRestoreCommand(tab, none) as Terminal;
    expect(saved.persistentCommand).toBeUndefined();
    expect(saved.persistentCommandManual).toBe(false);
  });

  it("keeps a command typed by hand even when nothing runs", () => {
    const tab = term("t1", { persistentCommand: "lazygit", persistentCommandManual: true });
    expect(saveRestoreCommand(tab, none)).toBe(tab);
  });

  it("leaves an empty shell untouched, as the same object", () => {
    const tab = term("t1");
    expect(saveRestoreCommand(tab, none)).toBe(tab);
  });

  it("leaves a tab that already has everything stored as the same object", () => {
    const tab = term("t1", { persistentCommand: "make" });
    expect(saveRestoreCommand(tab, { ...none, running: "make" })).toBe(tab);
  });

  it("never copies the running command into an agent that resumes its own session", () => {
    const tab = term("t1");
    expect(saveRestoreCommand(tab, { running: "claude", agentResumable: true })).toBe(tab);
  });

  it("stores the launch command of an agent that has not reported a session", () => {
    expect(saveRestoreCommand(term("t1"), { running: "opencode", agentResumable: false })).toMatchObject({
      persistentCommand: "opencode",
    });
  });

  it("keeps a command typed by hand instead of the one running now", () => {
    const tab = term("t1", { persistentCommand: "make", persistentCommandManual: true });
    expect(saveRestoreCommand(tab, { ...none, running: "other" })).toBe(tab);
  });

  it("follows the running command when the stored one was not typed by hand", () => {
    const tab = term("t1", { persistentCommand: "old", persistentCommandManual: false });
    expect(saveRestoreCommand(tab, { ...none, running: "new" })).toMatchObject({ persistentCommand: "new" });
  });

  it("never touches a sleeping tab or a tab that is not a terminal", () => {
    const asleep = term("t1", { hibernation: { at: 1 } });
    expect(saveRestoreCommand(asleep, { ...none, running: "make" })).toBe(asleep);
    const doc = editor("e1", true);
    expect(saveRestoreCommand(doc, { ...none, running: "make" })).toBe(doc);
  });
});

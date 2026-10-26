// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { SHORTCUTS } from "@/modules/shortcuts/shortcuts";
import { SETTINGS_SECTIONS } from "@/modules/settings/sections";
import { DEFAULT_PREFERENCES } from "@/modules/settings/store";
import type { PaneNode, SplitNode } from "@/modules/workspaces/lib/types";
import {
  COMMAND_GROUPS,
  UNLISTED_SHORTCUTS,
  type CommandPaletteActionContext,
  createCommandItems,
} from "./commands";

function paneTree(count: number): SplitNode {
  const pane = (index: number): PaneNode => ({
    kind: "pane",
    id: `pane-${index}`,
    tabs: [],
    activeTabId: null,
  });
  let tree: SplitNode = pane(0);
  for (let index = 1; index < count; index += 1) {
    tree = {
      kind: "split",
      id: `split-${index}`,
      orientation: "horizontal",
      first: tree,
      second: pane(index),
      dividerPosition: 0.5,
    };
  }
  return tree;
}

function ctx(over: Partial<CommandPaletteActionContext> = {}): CommandPaletteActionContext {
  const fn = () => vi.fn();
  return {
    activeWorkspacePaneTree: null,
    workspacePaneLimit: DEFAULT_PREFERENCES.workspacePaneLimit,
    workspaceCount: 2,
    activeId: "ws-1",
    searchTarget: null,
    explorerRoot: "/p",
    home: "/h",
    openNewTab: fn(),
    openNewWorkspace: fn(),
    openNewEditor: fn(),
    openNewBrowser: fn(),
    openGitGraph: fn(),
    toggleSourceControl: fn(),
    closeActiveTabOrPane: fn(),
    splitPaneRight: fn(),
    splitPaneDown: fn(),
    focusSearch: fn(),
    focusExplorerSearch: fn(),
    toggleSidebar: fn(),
    openSettings: fn(),
    openKeyboardShortcuts: fn(),
    reopenClosedTab: fn(),
    openNewWindow: fn(),
    clearTerminal: fn(),
    toggleZenMode: fn(),
    profilerRunning: false,
    toggleProfiler: fn(),
    hasActiveTerminal: true,
    hibernated: false,
    activePaneTabCount: 2,
    hasActiveTab: true,
    hasActiveTabTitle: true,
    closeOtherTabs: fn(),
    closeAllTabs: fn(),
    resetActiveTabTitle: fn(),
    openWorkspaceProperties: fn(),
    openActionsConfiguration: fn(),
    shortcutHandlers: {},
    isShortcutAvailable: () => true,
    openSettingsSection: fn(),
    hasActiveTabNote: true,
    removeActiveTabNote: fn(),
    splitBrowserRight: fn(),
    splitBrowserDown: fn(),
    ...over,
  };
}

describe("palette catalog", () => {
  const items = createCommandItems(ctx());

  it("has a row for every shortcut, or an explained exception", () => {
    const covered = new Set(items.map((i) => i.shortcutId).filter(Boolean));
    const missing = SHORTCUTS.filter((s) => !covered.has(s.id) && !(s.id in UNLISTED_SHORTCUTS)).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it("has no stale exception", () => {
    const real = new Set(SHORTCUTS.map((s) => s.id));
    expect(Object.keys(UNLISTED_SHORTCUTS).filter((id) => !real.has(id as never))).toEqual([]);
  });

  it("does not list a shortcut that is also an exception", () => {
    const covered = new Set(items.map((i) => i.shortcutId).filter(Boolean));
    expect(Object.keys(UNLISTED_SHORTCUTS).filter((id) => covered.has(id as never))).toEqual([]);
  });

  it("has a Settings row per section that opens that section", () => {
    for (const section of SETTINGS_SECTIONS) {
      const open = vi.fn();
      const row = createCommandItems(ctx({ openSettingsSection: open })).find(
        (i) => i.id === `settings.section.${section.id}`,
      );
      expect(row, section.id).toBeDefined();
      expect(row?.group).toBe("Settings");
      row?.run();
      expect(open).toHaveBeenCalledWith(section.id);
    }
  });

  it("uses unique ids", () => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only uses declared groups", () => {
    const groups = new Set<string>(COMMAND_GROUPS);
    expect(items.filter((i) => !groups.has(i.group)).map((i) => i.id)).toEqual([]);
  });

  it("runs the app handler of a generated shortcut row", () => {
    const handler = vi.fn();
    const row = createCommandItems(ctx({ shortcutHandlers: { "tab.hibernate": handler } })).find(
      (i) => i.shortcutId === "tab.hibernate",
    );
    row?.run();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("disables a generated row with no handler", () => {
    const row = items.find((i) => i.shortcutId === "tab.hibernate");
    expect(row?.disabledReason).toBeTruthy();
  });

  it("disables a generated row whose context rule says it would do nothing", () => {
    const row = createCommandItems(
      ctx({
        shortcutHandlers: { "editor.save": vi.fn() },
        isShortcutAvailable: (id) => id !== "editor.save",
      }),
    ).find((i) => i.shortcutId === "editor.save");
    expect(row?.disabledReason).toBeTruthy();
  });

  it("gives generated rows a title that makes sense out of its group", () => {
    const find = (id: string) => items.find((i) => i.id === id)?.title;
    expect(find("explorer.viewFilesystem")).toBe("Explorer: File System");
    expect(find("explorer.viewPinned")).toBe("Explorer: Workspace Root");
    expect(find("sidebar.showGit")).toBe("Show Git Changes");
    expect(find("sidebar.showExplorer")).toBe("Explorer (cycle root)");
  });

  it("offers Remove note only when the tab has one", () => {
    const with_ = createCommandItems(ctx({ hasActiveTabNote: true })).find((i) => i.id === "tab.note.remove");
    const without = createCommandItems(ctx({ hasActiveTabNote: false })).find((i) => i.id === "tab.note.remove");
    expect(with_?.disabledReason).toBeUndefined();
    expect(without?.disabledReason).toBeTruthy();
  });

  it("offers the profiler as enable or disable depending on the setting", () => {
    const find = (running: boolean) =>
      createCommandItems(ctx({ profilerRunning: running })).find((i) => i.id === "profiler.toggle");
    expect(find(false)?.title).toBe("Enable performance profiler");
    expect(find(true)?.title).toBe("Disable performance profiler");
  });

  it("disables Close other tabs when the pane holds a single tab", () => {
    const single = createCommandItems(ctx({ activePaneTabCount: 1 })).find((i) => i.id === "tab.closeOthers");
    const many = createCommandItems(ctx({ activePaneTabCount: 2 })).find((i) => i.id === "tab.closeOthers");
    expect(single?.disabledReason).toBe("Single tab");
    expect(many?.disabledReason).toBeUndefined();
  });

  it("disables the tab title reset when the tab has no own title", () => {
    const own = createCommandItems(ctx({ hasActiveTabTitle: true })).find((i) => i.id === "tab.resetTitle");
    const inherited = createCommandItems(ctx({ hasActiveTabTitle: false })).find((i) => i.id === "tab.resetTitle");
    expect(own?.disabledReason).toBeUndefined();
    expect(inherited?.disabledReason).toBe("No custom title");
  });

  it("uses the configured pane limit instead of a hardcoded one", () => {
    const splitIds = ["pane.splitRight", "pane.splitDown", "pane.splitBrowserRight", "pane.splitBrowserDown"];
    const under = new Map(
      createCommandItems(ctx({ activeWorkspacePaneTree: paneTree(7), workspacePaneLimit: 8 })).map((i) => [i.id, i]),
    );
    const at = new Map(
      createCommandItems(ctx({ activeWorkspacePaneTree: paneTree(8), workspacePaneLimit: 8 })).map((i) => [i.id, i]),
    );
    for (const id of splitIds) {
      expect(under.get(id)?.disabledReason, id).toBeUndefined();
      expect(at.get(id)?.disabledReason, id).toBe("Pane limit");
    }
  });

  it("pins the default pane limit at 8", () => {
    expect(DEFAULT_PREFERENCES.workspacePaneLimit).toBe(8);
    const atLimit = new Map(
      createCommandItems(ctx({ activeWorkspacePaneTree: paneTree(8) })).map((i) => [i.id, i]),
    );
    expect(atLimit.get("pane.splitRight")?.disabledReason).toBe("Pane limit");
  });

  it("disables the rows that need an active tab when there is none", () => {
    const items = new Map(
      createCommandItems(ctx({ hasActiveTab: false, activePaneTabCount: 0 })).map((i) => [i.id, i]),
    );
    expect(items.get("tab.moveToWorkspace")?.disabledReason).toBe("No active tab");
    expect(items.get("tab.closeAll")?.disabledReason).toBe("No tabs");
  });
});

describe("createCommandItems while the focused tab is hibernated", () => {
  const byId = (hibernated: boolean, over: Partial<CommandPaletteActionContext> = {}) =>
    new Map(createCommandItems(ctx({ hibernated, ...over })).map((i) => [i.id, i]));

  it("disables the commands that act on a live terminal", () => {
    const items = byId(true);
    for (const id of ["terminal.clear", "search.focus", "history.open"]) {
      expect(items.get(id)?.disabledReason, id).toBe("Tab hibernated");
    }
  });

  it("also disables the generated rows of blocked shortcuts", () => {
    const items = byId(true, { shortcutHandlers: { "terminal.scratchpad": vi.fn() } });
    expect(items.get("terminal.scratchpad")?.disabledReason).toBe("Tab hibernated");
  });

  it("leaves everything that does not act on a live terminal usable", () => {
    const items = byId(true);
    for (const id of ["settings.open", "workspace.new", "window.new", "workspace.properties", "tab.reopenClosed", "settings.section.general", "tab.new", "tab.close", "pane.splitRight", "sidebar.toggle", "git.graph"]) {
      expect(items.get(id)?.disabledReason, id).toBeUndefined();
    }
  });

  it("changes nothing for an awake tab", () => {
    expect(byId(false).get("tab.new")?.disabledReason).toBeUndefined();
  });
});

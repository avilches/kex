// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { SHORTCUTS } from "@/modules/shortcuts/shortcuts";
import { SETTINGS_SECTIONS } from "@/modules/settings/sections";
import {
  COMMAND_GROUPS,
  UNLISTED_SHORTCUTS,
  type CommandPaletteActionContext,
  createCommandItems,
} from "./commands";

function ctx(over: Partial<CommandPaletteActionContext> = {}): CommandPaletteActionContext {
  const fn = () => vi.fn();
  return {
    activeWorkspacePaneTree: null,
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
    const row = createCommandItems(ctx({ shortcutHandlers: { "workspace.hibernate": handler } })).find(
      (i) => i.shortcutId === "workspace.hibernate",
    );
    row?.run();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("disables a generated row with no handler", () => {
    const row = items.find((i) => i.shortcutId === "workspace.hibernate");
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

  it("disables the rows that need an active tab when there is none", () => {
    const items = new Map(
      createCommandItems(ctx({ hasActiveTab: false, activePaneTabCount: 0 })).map((i) => [i.id, i]),
    );
    expect(items.get("tab.moveToWorkspace")?.disabledReason).toBe("No active tab");
    expect(items.get("tab.closeAll")?.disabledReason).toBe("No tabs");
  });
});

describe("createCommandItems while the workspace is hibernated", () => {
  const byId = (hibernated: boolean, over: Partial<CommandPaletteActionContext> = {}) =>
    new Map(createCommandItems(ctx({ hibernated, ...over })).map((i) => [i.id, i]));

  it("disables every command that acts on tabs, panes, git or the Sidebar", () => {
    const items = byId(true);
    for (const id of ["tab.new", "tab.newBrowser", "tab.close", "terminal.clear", "pane.splitRight", "pane.splitDown", "git.graph", "git.source", "search.focus", "explorer.search", "sidebar.toggle", "history.open", "search.content", "workspace.runScripts"]) {
      expect(items.get(id)?.disabledReason, id).toBe("Workspace hibernated");
    }
  });

  it("also disables the generated rows of blocked shortcuts", () => {
    const items = byId(true, { shortcutHandlers: { "tab.rename": vi.fn() } });
    expect(items.get("tab.rename")?.disabledReason).toBe("Workspace hibernated");
  });

  it("leaves settings, new workspace, new window and workspace properties usable", () => {
    const items = byId(true);
    for (const id of ["settings.open", "workspace.new", "window.new", "workspace.properties", "tab.reopenClosed", "settings.section.general"]) {
      expect(items.get(id)?.disabledReason, id).toBeUndefined();
    }
  });

  it("changes nothing for an awake workspace", () => {
    expect(byId(false).get("tab.new")?.disabledReason).toBeUndefined();
  });
});

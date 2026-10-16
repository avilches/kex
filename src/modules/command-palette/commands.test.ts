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
    openWorkspaceProperties: fn(),
    openRunScriptConfiguration: fn(),
    shortcutHandlers: {},
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

  it("offers Remove note only when the tab has one", () => {
    const with_ = createCommandItems(ctx({ hasActiveTabNote: true })).find((i) => i.id === "tab.note.remove");
    const without = createCommandItems(ctx({ hasActiveTabNote: false })).find((i) => i.id === "tab.note.remove");
    expect(with_?.disabledReason).toBeUndefined();
    expect(without?.disabledReason).toBeTruthy();
  });
});

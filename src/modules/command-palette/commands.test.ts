import { describe, expect, it, vi } from "vitest";
import { createCommandItems, type CommandPaletteActionContext } from "./commands";

const ctx = (hibernated: boolean): CommandPaletteActionContext => ({
  activeWorkspacePaneTree: null,
  workspaceCount: 3,
  activeId: "ws-1",
  searchTarget: null,
  explorerRoot: "/p",
  home: "/h",
  openNewTab: vi.fn(),
  openNewWorkspace: vi.fn(),
  openNewEditor: vi.fn(),
  openNewBrowser: vi.fn(),
  openGitGraph: vi.fn(),
  toggleSourceControl: vi.fn(),
  closeActiveTabOrPane: vi.fn(),
  splitPaneRight: vi.fn(),
  splitPaneDown: vi.fn(),
  focusSearch: vi.fn(),
  focusExplorerSearch: vi.fn(),
  toggleSidebar: vi.fn(),
  openSettings: vi.fn(),
  openKeyboardShortcuts: vi.fn(),
  reopenClosedTab: vi.fn(),
  openNewWindow: vi.fn(),
  clearTerminal: vi.fn(),
  toggleZenMode: vi.fn(),
  hasActiveTerminal: true,
  hibernated,
  openWorkspaceProperties: vi.fn(),
  openRunScriptConfiguration: vi.fn(),
});

describe("createCommandItems while the workspace is hibernated", () => {
  const byId = (hibernated: boolean) => new Map(createCommandItems(ctx(hibernated)).map((i) => [i.id, i]));

  it("disables every command that acts on tabs, panes, git or the Sidebar", () => {
    const items = byId(true);
    for (const id of ["tab.new", "tab.newBrowser", "tab.close", "terminal.clear", "pane.splitRight", "pane.splitDown", "git.graph", "git.source", "search.focus", "explorer.search", "sidebar.toggle", "history.open", "search.content", "workspace.runScripts"]) {
      expect(items.get(id)?.disabledReason, id).toBe("Workspace hibernated");
    }
  });

  it("leaves settings, new workspace, new window and workspace properties usable", () => {
    const items = byId(true);
    for (const id of ["settings.open", "workspace.new", "window.new", "workspace.properties", "tab.reopenClosed"]) {
      expect(items.get(id)?.disabledReason, id).toBeUndefined();
    }
  });

  it("changes nothing for an awake workspace", () => {
    expect(byId(false).get("tab.new")?.disabledReason).toBeUndefined();
  });
});

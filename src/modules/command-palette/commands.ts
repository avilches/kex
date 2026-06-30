import type { SearchTarget } from "@/modules/header";
import { allPaneIds } from "@/modules/workspaces";
import type { SplitNode } from "@/modules/workspaces";
import {
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  FileEditIcon,
  FileSearchIcon,
  Globe02Icon,
  KeyboardIcon,
  LayoutTwoColumnIcon,
  LayoutTwoRowIcon,
  PaintBoardIcon,
  PlayIcon,
  Refresh01Icon,
  Search01Icon,
  Settings01Icon,
  SidebarLeftIcon,
  SourceCodeIcon,
  TerminalIcon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import type { PaletteItem } from "./types";

export const COMMAND_GROUPS = [
  "General",
  "Tabs",
  "Panes",
  "Git",
  "Search",
  "View",
] as const;

const MAX_PANES_PER_WORKSPACE = 4;

export type CommandPaletteActionContext = {
  activeWorkspacePaneTree: SplitNode | null;
  workspaceCount: number;
  activeId: string;
  searchTarget: SearchTarget;
  explorerRoot: string | null;
  home: string | null;
  openNewTab: () => void;
  openNewWorkspace: () => void;
  openNewEditor: () => void;
  openNewBrowser: () => void;
  openGitGraph: () => void;
  toggleSourceControl: () => void;
  closeActiveTabOrPane: () => void;
  splitPaneRight: () => void;
  splitPaneDown: () => void;
  focusSearch: () => void;
  focusExplorerSearch: () => void;
  toggleSidebar: () => void;
  openSettings: () => void;
  openKeyboardShortcuts: () => void;
  reopenClosedTab: () => void;
  openNewWindow: () => void;
  clearTerminal: () => void;
  toggleZenMode: () => void;
  hasActiveTerminal: boolean;
  openWorkspaceProperties: () => void;
  openRunScriptConfiguration: () => void;
};

const noop = () => {};

export function createCommandItems(
  ctx: CommandPaletteActionContext,
): PaletteItem[] {
  const activePaneCount = ctx.activeWorkspacePaneTree
    ? allPaneIds(ctx.activeWorkspacePaneTree).length
    : 0;
  const onlyOneWorkspace = ctx.workspaceCount < 2;
  const noWorkspaceRoot = !ctx.explorerRoot && !ctx.home;
  const splitDisabled =
    activePaneCount >= MAX_PANES_PER_WORKSPACE ? "Pane limit" : undefined;
  const closeDisabled =
    onlyOneWorkspace && activePaneCount < 2 ? "Last workspace" : undefined;

  return [
    {
      id: "settings.open",
      title: "Open settings",
      group: "General",
      keywords: ["preferences", "config"],
      icon: Settings01Icon,
      shortcutId: "settings.open",
      run: ctx.openSettings,
    },
    {
      id: "theme.pick",
      title: "Change theme...",
      group: "General",
      keywords: ["theme", "appearance", "color", "dark", "light"],
      icon: PaintBoardIcon,
      run: noop,
    },
    {
      id: "shortcuts.open",
      title: "Keyboard shortcuts",
      group: "General",
      keywords: ["keys", "keybindings", "settings"],
      icon: KeyboardIcon,
      run: ctx.openKeyboardShortcuts,
    },
    {
      id: "tab.new",
      title: "New terminal tab",
      group: "Tabs",
      keywords: ["shell", "terminal", "new tab", "pane"],
      icon: TerminalIcon,
      shortcutId: "tab.new",
      run: ctx.openNewTab,
    },
    {
      id: "workspace.new",
      title: "New workspace",
      group: "Tabs",
      keywords: ["workspace", "sidebar", "new"],
      icon: TerminalIcon,
      shortcutId: "workspace.new",
      run: ctx.openNewWorkspace,
    },
    {
      id: "window.new",
      title: "New window",
      group: "General",
      keywords: ["window", "new", "open"],
      icon: TerminalIcon,
      shortcutId: "window.new",
      run: ctx.openNewWindow,
    },
    {
      id: "tab.reopenClosed",
      title: "Reopen closed tab",
      group: "Tabs",
      keywords: ["reopen", "undo close", "restore tab"],
      icon: ArrowReloadHorizontalIcon,
      shortcutId: "tab.reopenClosed",
      run: ctx.reopenClosedTab,
    },
    {
      id: "terminal.clear",
      title: "Clear terminal",
      group: "Tabs",
      keywords: ["clear", "clean", "reset", "terminal"],
      icon: Refresh01Icon,
      shortcutId: "terminal.clear",
      disabledReason: ctx.hasActiveTerminal ? undefined : "No active terminal",
      run: ctx.clearTerminal,
    },
    {
      id: "view.zenMode",
      title: "Toggle full pane",
      group: "View",
      keywords: ["zen", "fullscreen", "focus", "expand", "pane"],
      icon: UnfoldMoreIcon,
      shortcutId: "view.zenMode",
      disabledReason: activePaneCount > 1 ? undefined : "Single pane",
      run: ctx.toggleZenMode,
    },
    {
      id: "tab.newEditor",
      title: "New editor tab",
      group: "Tabs",
      keywords: ["file", "editor", "create"],
      icon: FileEditIcon,
      shortcutId: "tab.newEditor",
      disabledReason: noWorkspaceRoot ? "No workspace root" : undefined,
      run: ctx.openNewEditor,
    },
    {
      id: "tab.newBrowser",
      title: "New browser tab",
      group: "Tabs",
      keywords: ["browser", "web", "localhost", "preview"],
      icon: Globe02Icon,
      shortcutId: "tab.newBrowser",
      run: ctx.openNewBrowser,
    },
    {
      id: "tab.close",
      title: "Close tab or pane",
      group: "Tabs",
      keywords: ["close", "remove", "pane"],
      icon: Cancel01Icon,
      shortcutId: "tab.close",
      disabledReason: closeDisabled,
      run: ctx.closeActiveTabOrPane,
    },
    {
      id: "pane.splitRight",
      title: "Split pane right",
      group: "Panes",
      keywords: ["terminal", "pane", "split", "right", "column"],
      icon: LayoutTwoColumnIcon,
      shortcutId: "pane.splitRight",
      disabledReason: splitDisabled,
      run: ctx.splitPaneRight,
    },
    {
      id: "pane.splitDown",
      title: "Split pane down",
      group: "Panes",
      keywords: ["terminal", "pane", "split", "down", "row"],
      icon: LayoutTwoRowIcon,
      shortcutId: "pane.splitDown",
      disabledReason: splitDisabled,
      run: ctx.splitPaneDown,
    },
    {
      id: "git.graph",
      title: "Open git graph",
      group: "Git",
      keywords: ["git", "graph", "history", "log", "commits"],
      icon: SourceCodeIcon,
      run: ctx.openGitGraph,
    },
    {
      id: "git.source",
      title: "Toggle Git panel",
      group: "Git",
      keywords: ["git", "source control", "changes", "staging", "diff"],
      icon: SourceCodeIcon,
      run: ctx.toggleSourceControl,
    },
    {
      id: "search.content",
      title: "Find content in files",
      group: "Search",
      keywords: ["grep", "ripgrep", "text", "contents", "search in files"],
      icon: FileSearchIcon,
      trailing: "#",
      run: noop,
    },
    {
      id: "history.open",
      title: "Search command history",
      group: "Search",
      keywords: ["history", "shell", "rerun", "previous commands"],
      icon: TerminalIcon,
      trailing: ">",
      run: noop,
    },
    {
      id: "search.focus",
      title: "Find in current tab",
      group: "Search",
      keywords: ["find", "terminal", "editor", "current"],
      icon: Search01Icon,
      shortcutId: "search.focus",
      disabledReason: ctx.searchTarget ? undefined : "No searchable view",
      run: ctx.focusSearch,
    },
    {
      id: "explorer.search",
      title: "Search files by name",
      group: "Search",
      keywords: ["explorer", "workspace", "file", "open"],
      icon: Search01Icon,
      shortcutId: "explorer.search",
      disabledReason: ctx.explorerRoot ? undefined : "No workspace root",
      run: ctx.focusExplorerSearch,
    },
    {
      id: "sidebar.toggle",
      title: "Toggle sidebar",
      group: "View",
      keywords: ["sidebar", "panel", "right", "toggle"],
      icon: SidebarLeftIcon,
      shortcutId: "sidebar.toggle",
      run: ctx.toggleSidebar,
    },
    {
      id: "workspace.properties",
      title: "Workspace properties",
      group: "General",
      keywords: ["workspace", "settings", "name", "root", "properties", "configure"],
      icon: Settings01Icon,
      run: ctx.openWorkspaceProperties,
    },
    {
      id: "workspace.runScripts",
      title: "Run script configuration",
      group: "General",
      keywords: ["run", "script", "scripts", "configure", "configuration", "commands"],
      icon: PlayIcon,
      run: ctx.openRunScriptConfiguration,
    },
  ];
}

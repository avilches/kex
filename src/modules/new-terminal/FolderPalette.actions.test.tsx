// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Action } from "@/modules/actions/lib/types";
import { ActionMenuProvider } from "@/modules/actions/RowActionsMenu";
import { runPaletteShortcut } from "@/modules/command-palette/lib/paletteControl";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { FolderPalette } from "./FolderPalette";
import type { FolderGroup, FolderRow } from "./lib/folderEntries";

const agent: Action = { id: "g1", name: "Claude Code", kind: "agent", command: "claude", cwdMode: "context", ownButton: true };
const rootAgent: Action = { id: "g2", name: "Codex", kind: "agent", command: "codex", cwdMode: "workspace", ownButton: true };
const devScript: Action = { id: "s1", name: "Dev {cwd}", kind: "script", command: "echo {cwd}", cwdMode: "workspace", ownButton: false };
const app: Action = { id: "a1", name: "Zed {cwd}", kind: "app", command: "zed {cwd}", ownButton: false };

const workspace = (o: Partial<Workspace> = {}): Workspace =>
  ({ id: "ws-2", title: "Other", workspaceRoot: "/o", cwd: "/o", actions: [], ...o }) as Workspace;

const row = (path: string, workspaceId: string): FolderRow => ({
  key: `${workspaceId}:${path}`,
  path,
  display: path,
  displayShift: 0,
  labels: [],
  branch: null,
  repoKey: null,
  repoName: null,
  pinned: false,
  slots: [],
  cluster: 1,
  headed: false,
  worktreeCount: 0,
  worktreesLoading: false,
  nested: false,
  repoHint: null,
  matchOffset: 0,
  workspaceId,
});

const groups = (path: string): FolderGroup[] => [
  {
    workspaceId: "ws-2",
    workspaceTitle: "Other",
    workspaceColor: null,
    workspaceIcon: null,
    active: false,
    rows: [row(path, "ws-2")],
  },
];

function mount(path: string, ws: Workspace | undefined, run = vi.fn()) {
  render(
    createElement(
      ActionMenuProvider,
      { run, ws: null, children: undefined },
      createElement(FolderPalette, {
        open: true,
        onOpenChange: vi.fn(),
        restoreFocus: vi.fn(),
        groups: groups(path),
        onPick: vi.fn(),
        onToggleWorktrees: vi.fn(),
        workspaceOf: () => ws,
      }),
    ),
  );
  return run;
}

const input = () => document.querySelector<HTMLInputElement>('[cmdk-input=""]') as HTMLInputElement;
const menuLabels = () => [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent);

async function openMenu() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  await act(async () => {
    fireEvent.keyDown(input(), { key: "Tab" });
  });
}

describe("FolderPalette row menu Actions", () => {
  beforeEach(() => usePreferencesStore.setState({ actions: [agent, rootAgent, devScript, app] }));
  afterEach(() => {
    cleanup();
    usePreferencesStore.setState({ actions: [] });
  });

  it("in a subfolder lists the agents of the current directory, never a script, an app or a workspace one", async () => {
    mount("/o/src", workspace());
    await openMenu();
    expect(menuLabels()).toEqual([
      expect.stringContaining("New Tab in src"),
      expect.stringContaining("Copy Absolute Path"),
      expect.stringContaining("Claude Code"),
    ]);
  });

  it("at the workspace folder adds the workspace agent", async () => {
    mount("/o", workspace());
    await openMenu();
    expect(menuLabels().some((l) => l?.startsWith("Codex"))).toBe(true);
    expect(menuLabels().some((l) => l?.startsWith("Zed"))).toBe(false);
  });

  it("running one closes the palette and runs it in the workspace of the row", async () => {
    const run = mount("/o/src", workspace());
    await openMenu();
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent?.startsWith("Claude Code"));
    await act(async () => {
      fireEvent.click(item as Element);
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toMatchObject({ id: "g1" });
    expect(run.mock.calls[0][1]).toMatchObject({ workspaceId: "ws-2", focusFolder: "/o/src" });
  });

  it("Cmd+digit runs the Nth Action of the open menu, and does nothing without a menu", async () => {
    const run = mount("/o", workspace());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    await act(async () => {
      runPaletteShortcut("menuAction", 1);
    });
    expect(run).not.toHaveBeenCalled();
    await openMenu();
    await act(async () => {
      runPaletteShortcut("folderMain", 2);
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toMatchObject({ id: "g2" });
  });

  it("a row whose workspace is unknown offers no Actions", async () => {
    mount("/o/src", undefined);
    await openMenu();
    expect(menuLabels()).toHaveLength(2);
  });
});

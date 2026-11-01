// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "@/modules/workspaces/lib/types";
import { CommandPalette } from "./CommandPalette";
import { runPaletteTabItem } from "./lib/paletteControl";
import type { TabEntry, WorkspaceEntry } from "./lib/tabEntries";
import { TAB_MENU_NOOPS } from "./tabMenuTestProps";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue({}) }));
vi.mock("@/modules/settings/preferences", () => {
  const state = { shortcuts: {}, autofocusMode: "manual" };
  const store = (sel: (s: typeof state) => unknown) => sel(state);
  store.getState = () => state;
  return { usePreferencesStore: store };
});
vi.mock("@/modules/theme", () => ({
  listBuiltinThemes: () => [],
  useTheme: () => ({ themeId: "t", customThemes: [], setThemeId() {}, previewThemeId() {} }),
}));
vi.mock("@/modules/explorer/lib/iconResolver", () => ({ fileIconUrl: () => "" }));
vi.mock("@/modules/workspaces/WorkspaceMark", () => ({ WorkspaceMark: () => null }));
vi.mock("./hooks/useCommandHistory", () => ({
  useCommandHistory: () => ({ loading: false, error: null, results: [], retry() {} }),
}));

afterEach(cleanup);

const entry = (id: string, i: number): TabEntry => {
  const tab = { id, kind: "terminal", cwd: "/p" } as Tab;
  return {
    tabId: id, workspaceId: "ws", workspaceTitle: "W", workspaceColor: null, workspaceIcon: null,
    workspaceRoot: null, hibernated: false, kind: "terminal", title: id, note: null, cwd: "/p",
    detail: "/p", worktree: "", branch: "", process: "", command: "", agent: "", indicator: null,
    tab, agentSession: undefined, running: false, lastUsedAt: 100 - i, order: i,
  };
};
const wsEntry: WorkspaceEntry = {
  workspaceId: "ws", title: "ws", color: null, icon: null, tabCount: 1, root: "/p",
  canHibernate: false, lastUsedAt: 50,
};
const onHibernateTab = vi.fn(async (_tabId: string) => {});

function Harness() {
  return (
    <CommandPalette
      open
      onOpenChange={() => {}}
      restoreFocus={() => {}}
      initialMode="commands"
      commandItems={[]}
      actionsWorkspace={null}
      onRunAction={() => {}}
      onStopAction={() => {}}
      onEditAction={() => {}}
      workspaceRoot={null}
      onOpenContentHit={() => {}}
      insertCommand={null}
      activeTabId="cur"
      activeWorkspaceId="ws"
      tabEntries={[entry("cur", 0), entry("b", 1), entry("c", 2)]}
      workspaceEntries={[wsEntry]}
      closedEntries={[]}
      onSelectTab={() => {}}
      onSelectWorkspace={() => {}}
      onRunClosed={() => {}}
      {...TAB_MENU_NOOPS}
      onHibernateTab={onHibernateTab}
      onTerminalTargetChange={() => {}}
      onOpenTerminalAt={() => {}}
      onCloseTab={() => {}}
      onCloseWorkspace={() => Promise.resolve(false)}
      onRenameWorkspace={() => {}}
      onHibernateWorkspace={() => {}}
      onCloseAllTabs={() => {}}
    />
  );
}

const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const selected = () =>
  document.querySelector('[cmdk-item][aria-selected="true"]')?.getAttribute("data-value") ?? "";
const press = (k: string, el: Element = document.activeElement ?? document.body) =>
  act(async () => { fireEvent.keyDown(el, { key: k }); });

describe("tab shortcuts over an open row menu", () => {
  it("act on the row the menu is anchored to, not on the one the pointer moved the highlight to", async () => {
    onHibernateTab.mockClear();
    render(<Harness />);
    await wait(50);
    for (let i = 0; i < 12 && selected() !== "tab:c"; i++) { await press("ArrowDown"); await wait(10); }
    expect(selected()).toBe("tab:c");
    (document.querySelector('[cmdk-input=""]') as HTMLInputElement).focus();
    // cmdk ignores the pointer after a key press until the pointer really moves: wake it up first.
    {
      const b = document.querySelector('[cmdk-item][data-value="tab:b"]') as HTMLElement;
      for (const x of [10, 20]) await act(async () => { fireEvent.pointerMove(b, { clientX: x, clientY: x }); });
      for (let i = 0; i < 12 && selected() !== "tab:c"; i++) { await press("ArrowDown"); await wait(10); }
    }
    await press("Tab");
    await wait(20);
    expect(document.querySelector('[role="menuitem"]')).not.toBeNull();

    const other = document.querySelector('[cmdk-item][data-value="tab:b"]') as HTMLElement;
    for (const x of [10, 20]) await act(async () => { fireEvent.pointerMove(other, { clientX: x, clientY: x }); });
    await wait(20);
    expect(selected()).toBe("tab:b");

    await act(async () => { runPaletteTabItem("hibernateTab"); });
    await wait(30);
    expect(onHibernateTab).toHaveBeenCalledTimes(1);
    expect(onHibernateTab.mock.calls[0]![0]).toBe("c");
  });

  it("act on the highlighted row when no menu is open", async () => {
    onHibernateTab.mockClear();
    render(<Harness />);
    await wait(50);
    for (let i = 0; i < 12 && selected() !== "tab:b"; i++) { await press("ArrowDown"); await wait(10); }
    expect(selected()).toBe("tab:b");
    await act(async () => { runPaletteTabItem("hibernateTab"); });
    await wait(30);
    expect(onHibernateTab.mock.calls[0]![0]).toBe("b");
  });
});

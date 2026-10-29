// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paletteHoldsFocus } from "@/modules/terminal/lib/paletteHoldsFocus";
import type { Tab } from "@/modules/workspaces/lib/types";
import { CommandPalette } from "./CommandPalette";
import { runPaletteTabItem } from "./lib/paletteControl";
import type { TabEntry } from "./lib/tabEntries";
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

const entry = (id: string, i: number, asleep = false): TabEntry => {
  const tab = { id, kind: "terminal", cwd: "/p", ...(asleep ? { hibernation: { at: 1 } } : {}) } as Tab;
  return {
    tabId: id, workspaceId: "ws", workspaceTitle: "W", workspaceColor: null, workspaceIcon: null,
    workspaceRoot: null, hibernated: asleep, kind: "terminal", title: id, note: null, cwd: "/p",
    detail: "/p", worktree: "", branch: "", process: "", command: "", agent: "", indicator: null,
    tab, agentSession: undefined, running: false, lastUsedAt: 100 - i, order: i,
  };
};

// Stands in for the terminal slot: like focusSlot, it takes the focus unless the palette holds it.
let terminal: HTMLTextAreaElement;
const focusTerminal = () => {
  if (!paletteHoldsFocus()) terminal.focus();
};


let wake: () => void;

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <textarea data-testid="terminal" ref={(el) => { if (el) terminal = el; }} />
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        restoreFocus={focusTerminal}
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
        tabEntries={[entry("cur", 0), entry("c", 1, true)]}
        workspaceEntries={[]}
        closedEntries={[]}
        onSelectTab={() => {}}
        onSelectWorkspace={() => {}}
        onRunClosed={() => {}}
        {...TAB_MENU_NOOPS}
        onWakeTab={async () => {
          // The terminal mounts later than the click, and takes the focus when it does.
          setTimeout(focusTerminal, 20);
          wake();
        }}
        onTerminalTargetChange={() => {}}
        onOpenTerminalAt={() => {}}
        onCloseTab={() => {}}
        onCloseWorkspace={() => Promise.resolve(false)}
        onRenameWorkspace={() => {}}
        onHibernateWorkspace={() => {}}
        onCloseAllTabs={() => {}}
      />
    </>
  );
}

const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const input = () => document.querySelector<HTMLInputElement>('[cmdk-input=""]') as HTMLInputElement;
const selected = () =>
  document.querySelector('[cmdk-item][aria-selected="true"]')?.getAttribute("data-value") ?? "";

beforeEach(() => {
  wake = vi.fn();
});

async function openOnSleepingTab() {
  render(<Harness />);
  await wait(50);
  for (let i = 0; i < 6 && selected() !== "tab:c"; i++) {
    await act(async () => { fireEvent.keyDown(input(), { key: "ArrowDown" }); });
    await wait(10);
  }
  expect(selected()).toBe("tab:c");
  input().focus();
}

describe("restoring a tab from the palette", () => {
  it("keeps the focus in the palette input when the woken terminal mounts under it", async () => {
    await openOnSleepingTab();
    await act(async () => { runPaletteTabItem("hibernateTab"); });
    await wait(400);
    expect(wake).toHaveBeenCalled();
    expect(document.activeElement).toBe(input());
  });
});

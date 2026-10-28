// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HibernateDialog } from "@/app/components/HibernateDialog";
import type { Tab, Workspace } from "@/modules/workspaces/lib/types";
import { CommandPalette } from "./CommandPalette";
import { runPaletteTabItem } from "./lib/paletteControl";
import type { TabEntry, WorkspaceEntry } from "./lib/tabEntries";
import { useAgentStore } from "@/modules/agents/store/agentStore";
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
const workspace = {
  id: "ws", title: "W", activePaneId: "pane-1",
  paneTree: {
    kind: "pane", id: "pane-1", activeTabId: "c",
    tabs: [{ id: "c", kind: "terminal", cwd: "/p" }],
  },
} as unknown as Workspace;

const log: string[] = [];
let onChange: (o: boolean) => void;

// Mirrors App.tsx: the hibernate request resolves as soon as the dialog opens, not when it closes.
function Harness() {
  const [pending, setPending] = useState<Workspace | null>(null);
  return (
    <>
      <CommandPalette
        open
        onOpenChange={onChange}
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
        onHibernateTab={async () => {
          setPending(workspace);
        }}
        onTerminalTargetChange={() => {}}
        onOpenTerminalAt={() => {}}
        onCloseTab={() => {}}
        onCloseWorkspace={() => Promise.resolve(false)}
        onRenameWorkspace={() => {}}
        onHibernateWorkspace={() => {}}
        onCloseAllTabs={() => {}}
      />
      <HibernateDialog
        workspace={pending}
        tabIds={["c"]}
        onClose={() => setPending(null)}
        onConfirm={() => setPending(null)}
        onSaveTab={async () => null}
        onGoToTab={() => {}}
        onStopBusy={() => {}}
      />
    </>
  );
}

const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const input = () => document.querySelector<HTMLInputElement>('[cmdk-input=""]') as HTMLInputElement;
const selected = () =>
  document.querySelector('[cmdk-item][aria-selected="true"]')?.getAttribute("data-value") ?? "";
const press = (k: string, el: Element = document.activeElement ?? document.body) =>
  act(async () => { fireEvent.keyDown(el, { key: k }); });
const menuOpen = () => !!document.querySelector('[role="menuitem"]');
const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((x) => x.textContent?.startsWith(label));

async function setup() {
  render(<Harness />);
  await wait(50);
  for (let i = 0; i < 12 && selected() !== "tab:c"; i++) { await press("ArrowDown"); await wait(10); }
  expect(selected()).toBe("tab:c");
  input().focus();
}
const trace = (label: string) =>
  log.push(`${label}: active=${document.activeElement?.tagName}${document.activeElement === input() ? "(input)" : ""} dialog=${!!document.querySelector('[role="alertdialog"]')} menu=${menuOpen()}`);

beforeEach(() => {
  // Only a working agent makes the dialog ask: a running command is hibernated without a question.
  useAgentStore.setState({
    sessions: { c: { tabId: "c", workspaceId: "ws", agent: "claude", status: "working", restoreError: false, meta: { sessionId: "s" } } },
    notifications: [],
    closedSessions: {},
  } as never);
  log.length = 0;
  onChange = vi.fn();
});

async function openFromMenu(how: "enter" | "click") {
  await setup();
  await press("Tab");
  await wait(20);
  expect(menuOpen()).toBe(true);
  trace("menu open");
  if (how === "click") fireEvent.click(menuItem("Hibernate Tab") as HTMLElement);
  else {
    for (let i = 0; i < 12 && !menuItem("Hibernate Tab")?.hasAttribute("data-active"); i++) {
      await press("ArrowDown"); await wait(5);
    }
    await press("Enter");
  }
  await wait(30);
  trace("dialog opened");
  expect(screen.getByRole("alertdialog")).toBeTruthy();
}

describe("Hibernate Tab chosen from the row menu over the palette", () => {
  for (const how of ["enter", "click"] as const) {
    it(`Escape closes the dialog and the focus is the palette input (${how})`, async () => {
      await openFromMenu(how);
      await press("Escape", screen.getByRole("alertdialog"));
      trace("after Escape");
      await wait(400);
      trace("settled");
      console.log(log.join("\n"));
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
      expect(document.activeElement).toBe(input());
      expect(selected()).toBe("tab:c");
      expect(onChange).not.toHaveBeenCalled();
    });
  }

  for (const how of ["menu", "shortcut"] as const) {
    it(`Enter confirms the dialog and leaves the palette open (${how})`, async () => {
      if (how === "menu") await openFromMenu("enter");
      else {
        await setup();
        await act(async () => { runPaletteTabItem("hibernateTab"); });
        await wait(30);
      }
      expect(screen.getByRole("alertdialog")).toBeTruthy();
      await press("Enter", input());
      await wait(400);
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(input());
      expect(selected()).toBe("tab:c");
    });
  }

  it("Cancel returns the focus to the input", async () => {
    await openFromMenu("enter");
    fireEvent.click(screen.getByText("Cancel"));
    await wait(400);
    expect(document.activeElement).toBe(input());
    expect(selected()).toBe("tab:c");
  });

  it("the shortcut path keeps working", async () => {
    await setup();
    await act(async () => { runPaletteTabItem("hibernateTab"); });
    await wait(30);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await press("Escape", screen.getByRole("alertdialog"));
    await wait(400);
    expect(document.activeElement).toBe(input());
  });

  it("Escape on the row menu without a dialog closes only the menu", async () => {
    await setup();
    await press("Tab");
    await wait(20);
    expect(menuOpen()).toBe(true);
    await press("Escape", input());
    await wait(30);
    expect(menuOpen()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input());
  });
});

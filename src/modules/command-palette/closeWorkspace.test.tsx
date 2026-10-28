// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import { TAB_MENU_NOOPS } from "./tabMenuTestProps";
import { runPaletteShortcut } from "./lib/paletteControl";
import type { TabEntry, WorkspaceEntry } from "./lib/tabEntries";
import type { PaletteItem } from "./types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (sel: (s: { shortcuts: object }) => unknown) =>
    sel({ shortcuts: {} }),
}));
vi.mock("@/modules/theme", () => ({
  listBuiltinThemes: () => [],
  useTheme: () => ({
    themeId: "t",
    customThemes: [],
    setThemeId() {},
    previewThemeId() {},
  }),
}));
vi.mock("@/modules/explorer/lib/iconResolver", () => ({
  fileIconUrl: () => "",
}));
vi.mock("@/modules/workspaces/WorkspaceMark", () => ({
  WorkspaceMark: () => null,
}));
vi.mock("./hooks/useCommandHistory", () => ({
  useCommandHistory: () => ({
    loading: false,
    error: null,
    results: [],
    retry() {},
  }),
}));

afterEach(cleanup);

const mk = (id: string, workspaceId: string, i: number): TabEntry =>
  ({
    tabId: id,
    workspaceId,
    workspaceTitle: workspaceId,
    workspaceColor: null,
    workspaceIcon: null, workspaceRoot: null,
    hibernated: false,
    kind: "terminal",
    title: id,
    note: null,
    cwd: "/p",
    detail: "/p",
    worktree: "",
    branch: "",
    process: "",
    command: "",
    agent: "",
    indicator: null,
    tab: { id, kind: "terminal" },
    agentSession: undefined,
    running: false,
    lastUsedAt: 100 - i,
    order: i,
  }) as TabEntry;

const wsEntry = (workspaceId: string, i: number): WorkspaceEntry => ({
  workspaceId,
  title: workspaceId,
  color: null,
  icon: null,
  tabCount: 2,
  root: null,
  canHibernate: false,
  lastUsedAt: 50 - i,
});

const command: PaletteItem = { id: "do", title: "Do", group: "General", run() {} };

type State = { tabs: TabEntry[]; workspaces: WorkspaceEntry[] };
type CloseImpl = (
  id: string,
  set: (f: (s: State) => State) => void,
) => Promise<boolean>;
let impl: CloseImpl;
let initial: State;
let calls: string[];
let withCommand = true;

function Harness() {
  const [state, setState] = useState(initial);
  return (
    <CommandPalette
      open
      onOpenChange={() => {}}
      restoreFocus={() => {}}
      initialMode="commands"
      commandItems={withCommand ? [command] : []}
      actionsWorkspace={null}
      onRunAction={() => {}}
      onStopAction={() => {}}
      onEditAction={() => {}}
      workspaceRoot={null}
      onOpenContentHit={() => {}}
      insertCommand={null}
      activeTabId="cur"
      activeWorkspaceId="w1"
      tabEntries={state.tabs}
      workspaceEntries={state.workspaces}
      closedEntries={[]}
      onSelectTab={() => {}}
      onSelectWorkspace={() => {}}
      onRunClosed={() => {}}
      {...TAB_MENU_NOOPS}
      onTerminalTargetChange={() => {}}
      onOpenTerminalAt={() => {}}
      onCloseTab={() => {}}
      onCloseWorkspace={(id) => {
        calls.push(id);
        return impl(id, setState);
      }}
      onRenameWorkspace={() => {}}
      onHibernateWorkspace={() => {}}
      onCloseAllTabs={() => {}}
    />
  );
}

const rowIds = () =>
  [...document.querySelectorAll("[cmdk-item]")].map(
    (x) => x.getAttribute("data-value") ?? "",
  );
const selected = () =>
  document
    .querySelector('[cmdk-item][aria-selected="true"]')
    ?.getAttribute("data-value") ?? "";
const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
const key = (k: string) =>
  act(async () => {
    document
      .querySelector("[cmdk-root]")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
const closeWorkspaceShortcut = () =>
  act(async () => {
    runPaletteShortcut("closeWorkspace");
  });

const removing: CloseImpl = async (id, set) => {
  set((s) => ({
    tabs: s.tabs.filter((t) => t.workspaceId !== id),
    workspaces: s.workspaces.filter((w) => w.workspaceId !== id),
  }));
  return true;
};

const typeQuery = (q: string) =>
  act(async () => {
    const input = document.querySelector<HTMLInputElement>('[cmdk-input=""]');
    if (input) fireEvent.change(input, { target: { value: q } });
  });

async function openAndGoTo(target: string, query = "") {
  calls = [];
  withCommand = true;
  render(<Harness />);
  await wait(50);
  if (query) {
    await typeQuery(query);
    await wait(30);
  }
  for (let i = 0; i < 12 && selected() !== target; i++) {
    await key("ArrowDown");
    await wait(10);
  }
  expect(selected()).toBe(target);
}

const baseState = (): State => ({
  tabs: [
    mk("cur", "w1", 0),
    mk("a1", "w2", 1),
    mk("a2", "w2", 2),
    mk("b1", "w3", 3),
    mk("c1", "w4", 4),
  ],
  workspaces: [
    wsEntry("w1", 0),
    wsEntry("w2", 1),
    wsEntry("w3", 2),
    wsEntry("w4", 3),
    wsEntry("w5", 4),
    wsEntry("w6", 5),
  ],
});

describe("Cmd+Shift+W in the palette", () => {
  it("closes the workspace of the highlighted tab and selects the first row after the block", async () => {
    initial = baseState();
    impl = removing;
    await openAndGoTo("tab:a1");
    expect(rowIds()).toEqual([
      "tab:cur",
      "tab:a1",
      "tab:a2",
      "tab:b1",
      "tab:c1",
      "cmd:do",
    ]);
    await closeWorkspaceShortcut();
    await wait(50);
    expect(calls).toEqual(["w2"]);
    expect(rowIds()).toEqual(["tab:cur", "tab:b1", "tab:c1", "cmd:do"]);
    expect(selected()).toBe("tab:b1");
  });

  it("closes the workspace of a highlighted workspace row and selects the next one", async () => {
    initial = baseState();
    impl = removing;
    await openAndGoTo("ws:w5", "w");
    await closeWorkspaceShortcut();
    await wait(50);
    expect(calls).toEqual(["w5"]);
    expect(rowIds()).not.toContain("ws:w5");
    expect(selected()).toBe("ws:w6");
  });

  it("selects the row above the block when nothing stays below it", async () => {
    initial = {
      tabs: [mk("cur", "w1", 0), mk("a1", "w2", 1)],
      workspaces: [wsEntry("w1", 0), wsEntry("w2", 1)],
    };
    impl = removing;
    calls = [];
    withCommand = false;
    render(<Harness />);
    await wait(50);
    expect(selected()).toBe("tab:cur");
    await key("ArrowDown");
    await wait(10);
    expect(selected()).toBe("tab:a1");
    await closeWorkspaceShortcut();
    await wait(50);
    expect(rowIds()).toEqual(["tab:cur"]);
    expect(selected()).toBe("tab:cur");
  });

  it("is taken without closing anything on a row with no workspace", async () => {
    initial = baseState();
    impl = removing;
    await openAndGoTo("cmd:do");
    let taken = false;
    await act(async () => {
      taken = runPaletteShortcut("closeWorkspace");
    });
    expect(taken).toBe(true);
    expect(calls).toEqual([]);
    expect(rowIds()).toContain("tab:a1");
  });

  it("keeps rows and selection when the confirmation is cancelled", async () => {
    initial = baseState();
    impl = () => new Promise((r) => setTimeout(() => r(false), 50));
    await openAndGoTo("tab:a1");
    await closeWorkspaceShortcut();
    await wait(500);
    expect(rowIds()).toContain("tab:a2");
    expect(selected()).toBe("tab:a1");
  });

  it("gives the focus back to the palette input when the confirmation is cancelled", async () => {
    initial = baseState();
    impl = () => new Promise((r) => setTimeout(() => r(false), 50));
    await openAndGoTo("tab:a1");
    const input = document.querySelector<HTMLInputElement>('[cmdk-input=""]');
    input?.blur();
    await closeWorkspaceShortcut();
    await wait(500);
    expect(document.activeElement).toBe(input);
  });

  it("ignores a second Cmd+Shift+W while the first is pending", async () => {
    initial = baseState();
    impl = () => new Promise((r) => setTimeout(() => r(false), 50));
    await openAndGoTo("tab:a1");
    await closeWorkspaceShortcut();
    await closeWorkspaceShortcut();
    await wait(500);
    expect(calls).toEqual(["w2"]);
  });

  it("releases the guard when closing rejects, so a later close goes through", async () => {
    initial = baseState();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    impl = () => Promise.reject(new Error("boom"));
    await openAndGoTo("tab:a1");
    await closeWorkspaceShortcut();
    await wait(600);
    expect(calls).toEqual(["w2"]);
    impl = removing;
    await closeWorkspaceShortcut();
    await wait(50);
    expect(calls).toEqual(["w2", "w2"]);
    expect(rowIds()).not.toContain("tab:a1");
    error.mockRestore();
  });

  it("recomputes the list when the workspace being left is the active one", async () => {
    initial = baseState();
    impl = removing;
    await openAndGoTo("tab:cur");
    await closeWorkspaceShortcut();
    await wait(50);
    expect(calls).toEqual(["w1"]);
    expect(rowIds()).not.toContain("tab:cur");
    expect(selected()).toBe("tab:a1");
  });
});

// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import { runPaletteShortcut } from "./lib/paletteControl";
import type { TabEntry } from "./lib/tabEntries";

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

const mk = (id: string, i: number, over: Partial<TabEntry> = {}): TabEntry => ({
  tabId: id,
  workspaceId: "ws",
  workspaceTitle: "W",
  workspaceColor: null,
  workspaceIcon: null,
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
  ...over,
});

type SetTabs = (f: (t: TabEntry[]) => TabEntry[]) => void;
let closeImpl: (e: TabEntry, setTabs: SetTabs) => void | Promise<unknown>;
let initial: TabEntry[];

function Harness({ activeTabId = "cur" }: { activeTabId?: string }) {
  const [tabs, setTabs] = useState(initial);
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
      activeTabId={activeTabId}
      activeWorkspaceId="ws"
      tabEntries={tabs}
      workspaceEntries={[]}
      closedEntries={[]}
      onSelectTab={() => {}}
      onSelectWorkspace={() => {}}
      onRunClosed={() => {}}
      onMoveActiveTabToWorkspace={() => {}}
      onTerminalTargetChange={() => {}}
      onOpenTerminalAt={() => {}}
      onCloseTab={(e) => closeImpl(e, setTabs)}
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
const arrowDown = () =>
  act(async () => {
    document
      .querySelector("[cmdk-root]")
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
  });
const closeHighlighted = () =>
  act(async () => {
    runPaletteShortcut("closeTab");
  });
const removing: typeof closeImpl = (e, set) =>
  set((t) => t.filter((x) => x.tabId !== e.tabId));

async function openOn(n: number) {
  render(<Harness />);
  await wait(50);
  for (let i = 0; i < n; i++) {
    await arrowDown();
    await wait(10);
  }
}

describe("closing a tab from the palette", () => {
  it("selects the row below the closed one", async () => {
    initial = [mk("cur", 0), mk("b", 1), mk("c", 2), mk("d", 3)];
    closeImpl = removing;
    await openOn(1);
    expect(selected()).toBe("tab:b");
    await closeHighlighted();
    await wait(50);
    expect(rowIds()).not.toContain("tab:b");
    expect(selected()).toBe("tab:c");
  });

  it("selects the row above when the closed one was the last", async () => {
    initial = [mk("cur", 0), mk("b", 1), mk("c", 2)];
    closeImpl = removing;
    await openOn(2);
    expect(selected()).toBe("tab:c");
    await closeHighlighted();
    await wait(50);
    expect(selected()).toBe("tab:b");
  });

  it("closes several tabs in a row with the key held down", async () => {
    initial = [mk("cur", 0), mk("b", 1), mk("c", 2), mk("d", 3)];
    closeImpl = removing;
    await openOn(1);
    await closeHighlighted();
    await wait(50);
    await closeHighlighted();
    await wait(50);
    expect(rowIds()).toEqual(["tab:cur", "tab:d"]);
    expect(selected()).toBe("tab:d");
  });

  it("keeps the selection when the confirmation is cancelled", async () => {
    initial = [mk("cur", 0), mk("b", 1), mk("c", 2)];
    closeImpl = () => new Promise((r) => setTimeout(() => r(false), 50));
    await openOn(1);
    await closeHighlighted();
    await closeHighlighted();
    await wait(500);
    expect(selected()).toBe("tab:b");
  });

  it("releases the guard when closing rejects, so a later close still works", async () => {
    initial = [mk("cur", 0), mk("b", 1), mk("c", 2)];
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    closeImpl = () => Promise.reject(new Error("boom"));
    await openOn(1);
    await closeHighlighted();
    await wait(600);
    expect(selected()).toBe("tab:b");
    closeImpl = removing;
    await closeHighlighted();
    await wait(50);
    expect(rowIds()).not.toContain("tab:b");
    expect(selected()).toBe("tab:c");
    error.mockRestore();
  });

  it("moves to a hibernated tab that sorts below the closed one", async () => {
    initial = [mk("cur", 0), mk("b", 1), mk("c", 2, { hibernated: true })];
    closeImpl = removing;
    await openOn(1);
    expect(selected()).toBe("tab:b");
    await closeHighlighted();
    await wait(50);
    expect(selected()).toBe("tab:c");
  });

  it("leaves the current tab selected when it is the only one left", async () => {
    initial = [mk("cur", 0), mk("b", 1)];
    closeImpl = removing;
    await openOn(1);
    await closeHighlighted();
    await wait(50);
    expect(selected()).toBe("tab:cur");
  });
});

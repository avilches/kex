// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import { TAB_MENU_NOOPS } from "./tabMenuTestProps";
import { runPaletteTabItem } from "./lib/paletteControl";
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
  ...over,
});

type SetTabs = (f: (t: TabEntry[]) => TabEntry[]) => void;
// biome-ignore lint/suspicious/noConfusingVoidType: callers may return nothing or a promise
let closeImpl: (e: TabEntry, setTabs: SetTabs) => void | Promise<unknown>;
let initial: TabEntry[];

let closeCalls = 0;

function Harness({
  activeTabId = "cur",
  open = true,
}: {
  activeTabId?: string;
  open?: boolean;
}) {
  const [tabs, setTabs] = useState(initial);
  return (
    <CommandPalette
      open={open}
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
      {...TAB_MENU_NOOPS}
      onTerminalTargetChange={() => {}}
      onOpenTerminalAt={() => {}}
      onCloseTab={(e) => {
        closeCalls++;
        return closeImpl(e, setTabs);
      }}
      onCloseWorkspace={() => Promise.resolve(false)}
      onRenameWorkspace={() => {}}
      onHibernateWorkspace={() => {}}
      onCloseAllTabs={() => {}}
      onOpenWorkspaceSettings={() => {}}
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
    runPaletteTabItem("close");
  });
const removing: typeof closeImpl = (e, set) =>
  set((t) => t.filter((x) => x.tabId !== e.tabId));

async function openOn(n: number) {
  closeCalls = 0;
  render(<Harness />);
  await wait(50);
  for (let i = 0; i < n; i++) {
    await arrowDown();
    await wait(10);
  }
}

describe("the row highlighted on open", () => {
  it("is the current tab, not the previous one", async () => {
    initial = [mk("cur", 0), mk("b", 1), mk("c", 2)];
    closeImpl = removing;
    render(<Harness />);
    await wait(50);
    expect(selected()).toBe("tab:cur");
  });

  it("is the current tab when it is the only one", async () => {
    initial = [mk("cur", 0)];
    closeImpl = removing;
    render(<Harness />);
    await wait(50);
    expect(selected()).toBe("tab:cur");
  });
});

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
    await wait(500);
    expect(rowIds()).toContain("tab:b");
    expect(selected()).toBe("tab:b");
  });

  it("ignores a second close while the first is pending", async () => {
    initial = [mk("cur", 0), mk("b", 1), mk("c", 2)];
    closeImpl = () => new Promise((r) => setTimeout(() => r(false), 50));
    await openOn(1);
    await closeHighlighted();
    await closeHighlighted();
    await wait(500);
    expect(closeCalls).toBe(1);
  });

  it("releases the guard when closing rejects, so a later close goes through", async () => {
    initial = [mk("cur", 0), mk("b", 1), mk("c", 2)];
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    closeImpl = () => Promise.reject(new Error("boom"));
    await openOn(1);
    await closeHighlighted();
    await wait(600);
    expect(closeCalls).toBe(1);
    closeImpl = removing;
    await closeHighlighted();
    await wait(50);
    expect(closeCalls).toBe(2);
    expect(rowIds()).not.toContain("tab:b");
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

  it("empties the list without selecting anything when the only row is closed", async () => {
    initial = [mk("cur", 0)];
    closeImpl = removing;
    await openOn(0);
    expect(selected()).toBe("tab:cur");
    await closeHighlighted();
    await wait(50);
    expect(rowIds()).toEqual([]);
    expect(selected()).toBe("");
  });
});

describe("the frame that restores the selection", () => {
  let queue: Map<number, FrameRequestCallback>;
  let nextId: number;
  const flush = () =>
    act(async () => {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const cb of callbacks) cb(0);
    });

  const setup = async () => {
    queue = new Map();
    nextId = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      queue.set(nextId, cb);
      return nextId++;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      queue.delete(id);
    });
    initial = [mk("cur", 0), mk("b", 1), mk("c", 2), mk("d", 3)];
    closeImpl = removing;
    await openOn(1);
    queue.clear();
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("restores the successor when nothing intervenes", async () => {
    await setup();
    await closeHighlighted();
    await flush();
    expect(selected()).toBe("tab:c");
  });

  it("does not steal the selection from an arrow pressed before it runs", async () => {
    await setup();
    await closeHighlighted();
    await act(async () => {
      document
        .querySelector("[cmdk-root]")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "End", bubbles: true }),
        );
    });
    await flush();
    expect(selected()).toBe("tab:d");
  });

  it("is cancelled when the palette closes", async () => {
    await setup();
    await closeHighlighted();
    expect(queue.size).toBeGreaterThan(0);
    cleanup();
    expect(queue.size).toBe(0);
  });

  it("is cancelled when the palette is closed from outside", async () => {
    queue = new Map();
    nextId = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      queue.set(nextId, cb);
      return nextId++;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      queue.delete(id);
    });
    initial = [mk("cur", 0), mk("b", 1), mk("c", 2)];
    closeImpl = removing;
    closeCalls = 0;
    const view = render(<Harness />);
    await wait(50);
    await arrowDown();
    await wait(10);
    queue.clear();
    await closeHighlighted();
    expect(queue.size).toBeGreaterThan(0);
    view.rerender(<Harness open={false} />);
    expect(queue.size).toBe(0);
  });

  it("does not let Cmd+W close another tab before the selection is restored", async () => {
    await setup();
    await closeHighlighted();
    await closeHighlighted();
    await flush();
    expect(closeCalls).toBe(1);
    expect(rowIds()).toEqual(["tab:cur", "tab:c", "tab:d"]);
  });
});

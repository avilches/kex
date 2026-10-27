// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { type FunctionComponent, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BarItem } from "@/modules/actions/lib/actionsBar";
import type { Tab } from "@/modules/workspaces/lib/types";
import { CommandPalette } from "./CommandPalette";
import { COMMAND_GROUPS } from "./commands";
import type { ClosedTabEntry } from "./lib/closedEntries";
import type { TabEntry, WorkspaceEntry } from "./lib/tabEntries";
import { tabRowKey } from "./lib/tabRank";
import { TAB_MENU_NOOPS } from "./tabMenuTestProps";
import type { PaletteItem } from "./types";

const userAction = (id: string, global: boolean): BarItem =>
  ({
    id,
    global,
    name: id,
    action: { id, kind: "script", name: id, command: "x" },
    state: "idle",
    active: false,
    stoppable: false,
    disabledReason: null,
    subtitle: null,
    subtitleTrim: false,
    subtitleLead: null,
    title: null,
    iconOnly: false,
  }) as unknown as BarItem;

const barModel = {
  buttons: [] as BarItem[],
  menu: {
    workspace: [userAction("w1", false), userAction("w2", false)],
    global: ["g1", "g2", "g3", "g4"].map((id) => userAction(id, true)),
  },
};

vi.mock("@/modules/actions/lib/useActionsBar", () => ({
  useActionsBarModel: () => barModel,
}));
vi.mock("@/modules/actions/ActionIcon", () => ({ ActionIcon: () => null }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (sel: (s: { shortcuts: object; autofocusMode: string }) => unknown) =>
    sel({ shortcuts: {}, autofocusMode: "manual" }),
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
vi.mock("@/modules/explorer/lib/iconResolver", () => ({ fileIconUrl: () => "" }));
vi.mock("@/modules/workspaces/WorkspaceMark", () => ({ WorkspaceMark: () => null }));
vi.mock("./hooks/useCommandHistory", () => ({
  useCommandHistory: () => ({ loading: false, error: null, results: [], retry() {} }),
}));

afterEach(cleanup);

const tab = (id: string, i: number): TabEntry => ({
  tabId: id,
  workspaceId: "ws",
  workspaceTitle: "W",
  workspaceColor: null,
  workspaceIcon: null,
  workspaceRoot: null,
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
  tab: { id, kind: "terminal", cwd: "/p" } as Tab,
  agentSession: undefined,
  running: false,
  lastUsedAt: 1000 - i,
  order: i,
});

const closedEntry = (n: number): ClosedTabEntry => ({
  kind: "terminal",
  path: `/old/${n}`,
  workspaceId: "ws",
  uses: 0,
  lastUsedAt: n,
  key: `closed:terminal:/old/${n}`,
  title: `old${n}`,
  detail: `/old/${n}`,
  workspaceTitle: "W",
  workspaceColor: null,
  workspaceIcon: null,
});

const commands: PaletteItem[] = COMMAND_GROUPS.flatMap((group) =>
  Array.from({ length: 8 }, (_, n) => ({
    id: `${group}.${n}`,
    title: `${group} command ${n}`,
    group,
    run: () => {},
  })),
);

const wsEntry = (id: string, i: number): WorkspaceEntry => ({
  workspaceId: id,
  title: id,
  color: null,
  icon: null,
  tabCount: 1,
  root: "/p",
  canHibernate: false,
  lastUsedAt: 50 - i,
});

const manyTabs = () => Array.from({ length: 14 }, (_, i) => tab(i === 0 ? "cur" : `t${i}`, i));

let setOpenOutside: (v: boolean) => void = () => {};
let setClosedOutside: (v: ClosedTabEntry[]) => void = () => {};
let setTabsOutside: (v: TabEntry[]) => void = () => {};

const Harness: FunctionComponent<{ tabs?: TabEntry[]; activeTabId?: string | null }> = ({
  tabs = manyTabs(),
  activeTabId = "cur",
}) => {
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState<ClosedTabEntry[]>([1, 2, 3, 4, 5].map(closedEntry));
  const [entries, setEntries] = useState(tabs);
  setOpenOutside = setOpen;
  setClosedOutside = setClosed;
  setTabsOutside = setEntries;
  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      restoreFocus={() => {}}
      initialMode="commands"
      commandItems={commands}
      actionsWorkspace={{} as never}
      onRunAction={() => {}}
      onStopAction={() => {}}
      onEditAction={() => {}}
      workspaceRoot={null}
      onOpenContentHit={() => {}}
      insertCommand={null}
      activeTabId={activeTabId}
      activeWorkspaceId="ws"
      tabEntries={entries}
      workspaceEntries={[wsEntry("ws", 0), wsEntry("other", 1)]}
      closedEntries={closed}
      onSelectTab={() => {}}
      onSelectWorkspace={() => {}}
      onRunClosed={() => {}}
      {...TAB_MENU_NOOPS}
      onTerminalTargetChange={() => {}}
      onOpenTerminalAt={() => {}}
      onCloseTab={() => {}}
      onCloseWorkspace={() => Promise.resolve(false)}
      onRenameWorkspace={() => {}}
      onHibernateWorkspace={() => {}}
      onCloseAllTabs={() => {}}
      onOpenWorkspaceSettings={() => {}}
    />
  );
};

const selected = () =>
  document.querySelector('[cmdk-item][aria-selected="true"]')?.getAttribute("data-value") ?? "";
const rowIds = () =>
  [...document.querySelectorAll("[cmdk-item]")].map((x) => x.getAttribute("data-value") ?? "");
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
const viewport = () => document.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');

async function openPalette() {
  await act(async () => setOpenOutside(true));
  await wait(60);
}
async function closeFromOutside() {
  await act(async () => setOpenOutside(false));
  await wait(60);
}

describe("palette cursor when it opens", () => {
  it("lands on Current tab, with the list at the top, in a list as long as the real one", async () => {
    render(<Harness />);
    await openPalette();
    expect(rowIds().length).toBeGreaterThan(80);
    expect(selected()).toBe(tabRowKey("cur"));
    expect(rowIds()[0]).toBe(tabRowKey("cur"));
    expect(viewport()?.scrollTop ?? 0).toBe(0);
  });

  it("lands on Current tab again after the cursor was sent to Global actions and the app closed the palette", async () => {
    render(<Harness />);
    await openPalette();
    for (let i = 0; i < 40 && !selected().startsWith("act:g"); i++) await key("ArrowDown");
    expect(selected().startsWith("act:g")).toBe(true);
    await closeFromOutside();
    await openPalette();
    expect(selected()).toBe(tabRowKey("cur"));
    expect(viewport()?.scrollTop ?? 0).toBe(0);
  });

  it("lands on Current tab at every reopen, whichever way the palette was closed", async () => {
    render(<Harness />);
    for (let round = 0; round < 4; round++) {
      await openPalette();
      expect(selected()).toBe(tabRowKey("cur"));
      await key("End");
      expect(selected()).not.toBe(tabRowKey("cur"));
      if (round % 2 === 0) await closeFromOutside();
      else {
        await act(async () => {
          document
            .querySelector("[cmdk-input]")
            ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        });
        await wait(60);
      }
    }
  });

  it("stays on Current tab when the closed entries arrive after the palette opened", async () => {
    render(<Harness />);
    await act(async () => setClosedOutside([]));
    await openPalette();
    expect(selected()).toBe(tabRowKey("cur"));
    await act(async () => setClosedOutside([1, 2, 3].map(closedEntry)));
    await wait(60);
    expect(selected()).toBe(tabRowKey("cur"));
  });

  it("goes to the first row there is when the workspace has no tabs", async () => {
    render(<Harness tabs={[]} activeTabId={null} />);
    await openPalette();
    expect(selected()).toBe(rowIds()[0]);
    expect(selected()).toBe("closed:terminal:/old/1");
  });

  it("lands on Current tab after the tabs around it were closed", async () => {
    render(<Harness />);
    await openPalette();
    await closeFromOutside();
    await act(async () =>
      setTabsOutside(manyTabs().filter((t) => !["t1", "t2", "t3"].includes(t.tabId))),
    );
    await openPalette();
    expect(selected()).toBe(tabRowKey("cur"));
  });
});

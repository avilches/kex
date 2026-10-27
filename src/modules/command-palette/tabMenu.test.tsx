// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerTabNoteFlush, useTabNoteStore } from "@/modules/workspaces/lib/tabNoteStore";
import type { Tab } from "@/modules/workspaces/lib/types";
import { CommandPalette } from "./CommandPalette";
import { runPaletteTabItem } from "./lib/paletteControl";
import type { TabEntry, WorkspaceEntry } from "./lib/tabEntries";
import type { PaletteItem } from "./types";
import { TAB_MENU_NOOPS } from "./tabMenuTestProps";

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
vi.mock("@/modules/explorer/lib/iconResolver", () => ({
  fileIconUrl: () => "",
}));
vi.mock("@/modules/workspaces/WorkspaceMark", () => ({
  WorkspaceMark: () => null,
}));
const writeClipboardText = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/clipboard", () => ({ writeClipboardText: (t: string) => writeClipboardText(t) }));
vi.mock("./hooks/useCommandHistory", () => ({
  useCommandHistory: () => ({ loading: false, error: null, results: [], retry() {} }),
}));

afterEach(cleanup);

const mk = (id: string, i: number, tab: Record<string, unknown> = {}, over: Partial<TabEntry> = {}): TabEntry => {
  const full = { id, kind: "terminal", cwd: "/p", ...tab } as Tab;
  return {
    tabId: id,
    workspaceId: "ws",
    workspaceTitle: "W",
    workspaceColor: null,
    workspaceIcon: null,
    workspaceRoot: null,
    hibernated: full.kind === "terminal" && !!full.hibernation,
    kind: full.kind,
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
    tab: full,
    agentSession: undefined,
    running: false,
    lastUsedAt: 100 - i,
    order: i,
    ...over,
  };
};

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

type Calls = {
  update: [string, (t: Tab) => Tab][];
  save: string[];
  hibernate: string[];
  goTo: string[];
  move: unknown[][];
  openChange: boolean[];
};
let calls: Calls;
let initial: TabEntry[];
let commands: PaletteItem[] = [];
let hibernateImpl: (id: string) => unknown;

function Harness() {
  const [tabs, setTabs] = useState(initial);
  return (
    <CommandPalette
      open
      onOpenChange={(o) => calls.openChange.push(o)}
      restoreFocus={() => {}}
      initialMode="commands"
      commandItems={commands}
      actionsWorkspace={null}
      onRunAction={() => {}}
      onStopAction={() => {}}
      onEditAction={() => {}}
      workspaceRoot={null}
      onOpenContentHit={() => {}}
      insertCommand={null}
      activeTabId="cur"
      activeWorkspaceId="ws"
      tabEntries={tabs}
      workspaceEntries={[wsEntry("ws", 0), wsEntry("other", 1)]}
      closedEntries={[]}
      onSelectTab={() => {}}
      onSelectWorkspace={() => {}}
      onRunClosed={() => {}}
      {...TAB_MENU_NOOPS}
      onMoveTabToWorkspace={(...args) => calls.move.push(args)}
      onUpdateTab={(id, updater) => {
        calls.update.push([id, updater]);
        setTabs((t) =>
          t.map((e) => (e.tabId === id ? { ...e, tab: updater(e.tab) } : e)),
        );
      }}
      onSaveTab={(id) => calls.save.push(id)}
      onHibernateTab={(id) => {
        calls.hibernate.push(id);
        return hibernateImpl(id);
      }}
      onGoToTab={(id) => calls.goTo.push(id)}
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
}

const rowIds = () =>
  [...document.querySelectorAll("[cmdk-item]")].map((x) => x.getAttribute("data-value") ?? "");
const selected = () =>
  document.querySelector('[cmdk-item][aria-selected="true"]')?.getAttribute("data-value") ?? "";
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
async function shortcut(item: Parameters<typeof runPaletteTabItem>[0]): Promise<boolean> {
  let taken = false;
  await act(async () => {
    taken = runPaletteTabItem(item);
  });
  return taken;
}
const menuLabels = () =>
  [...document.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent ?? "");
const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((x) =>
    x.textContent?.startsWith(label),
  );
const locked = () => !!document.querySelector('[aria-label="Tab is locked"]');

async function openOn(target: string) {
  render(<Harness />);
  await wait(50);
  for (let i = 0; i < 12 && selected() !== target; i++) {
    await key("ArrowDown");
    await wait(10);
  }
  expect(selected()).toBe(target);
}

beforeEach(() => {
  calls = { update: [], save: [], hibernate: [], goTo: [], move: [], openChange: [] };
  commands = [];
  initial = [mk("cur", 0), mk("b", 1), mk("c", 2), mk("d", 3)];
  hibernateImpl = () => Promise.resolve();
  useTabNoteStore.setState({ focusTabId: null });
});

describe("tab shortcuts over the highlighted row", () => {
  it("lock acts on the highlighted tab, in place, keeping the row, the selection and the palette", async () => {
    await openOn("tab:c");
    expect(locked()).toBe(false);
    expect(await shortcut("lock")).toBe(true);
    await wait(30);
    expect(calls.update.map(([id]) => id)).toEqual(["c"]);
    expect(locked()).toBe(true);
    expect(rowIds()).toEqual(expect.arrayContaining(["tab:cur", "tab:b", "tab:c", "tab:d"]));
    expect(selected()).toBe("tab:c");
    expect(calls.openChange).toEqual([]);
    await shortcut("lock");
    await wait(30);
    expect(locked()).toBe(false);
    expect(selected()).toBe("tab:c");
  });

  it("flips the open menu in place when locking from it", async () => {
    await openOn("tab:c");
    await key("Tab");
    await wait(20);
    expect(menuLabels().some((l) => l.startsWith("Lock Tab"))).toBe(true);
    fireEvent.click(menuItem("Lock Tab") as HTMLElement);
    await wait(30);
    expect(locked()).toBe(true);
    expect(menuLabels().some((l) => l.startsWith("Unlock Tab"))).toBe(true);
    expect(menuItem("Close Tab")?.getAttribute("aria-disabled")).toBe("true");
    expect(selected()).toBe("tab:c");
  });

  it("is taken without effect when the highlighted row is not a tab", async () => {
    render(<Harness />);
    await wait(50);
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>('[cmdk-input=""]');
      if (input) fireEvent.change(input, { target: { value: "other" } });
    });
    await wait(30);
    expect(selected()).toBe("ws:other");
    for (const item of ["lock", "hibernateTab", "note", "save", "autofocus", "copy", "close"] as const) {
      expect(await shortcut(item)).toBe(true);
    }
    expect(calls.update).toEqual([]);
    expect(calls.hibernate).toEqual([]);
    expect(calls.openChange).toEqual([]);
    expect(selected()).toBe("ws:other");
  });

  it("is taken without effect when the highlighted tab does not offer the item", async () => {
    await openOn("tab:b");
    expect(await shortcut("save")).toBe(true);
    expect(calls.save).toEqual([]);
  });

  it("saves a dirty editor and keeps the palette open", async () => {
    initial = [mk("cur", 0), mk("e", 1, { kind: "editor", path: "/p/a.ts", dirty: true })];
    await openOn("tab:e");
    await shortcut("save");
    await wait(20);
    expect(calls.save).toEqual(["e"]);
    expect(calls.openChange).toEqual([]);
    expect(selected()).toBe("tab:e");
  });

  it("toggles autofocus in manual mode and keeps the palette open", async () => {
    await openOn("tab:b");
    await shortcut("autofocus");
    await wait(20);
    expect(calls.update.map(([id]) => id)).toEqual(["b"]);
    const flipped = calls.update[0][1]({ id: "b", kind: "terminal" } as Tab);
    expect(flipped).toMatchObject({ autofocus: true });
    expect(calls.openChange).toEqual([]);
  });

  it("add note on another tab activates it, asks the note for the focus and closes the palette", async () => {
    await openOn("tab:c");
    await shortcut("note");
    await wait(30);
    expect(calls.openChange).toContain(false);
    expect(calls.goTo).toEqual(["c"]);
    expect(useTabNoteStore.getState().focusTabId).toBe("c");
    const [id, updater] = calls.update[0];
    expect(id).toBe("c");
    expect(updater({ id: "c", kind: "terminal" } as Tab)).toMatchObject({ note: "", noteOpen: true });
  });

  it("add note on the current tab closes the palette and focuses the note too", async () => {
    await openOn("tab:cur");
    await shortcut("note");
    await wait(30);
    expect(calls.openChange).toContain(false);
    expect(calls.goTo).toEqual(["cur"]);
    expect(useTabNoteStore.getState().focusTabId).toBe("cur");
    expect(calls.update.map(([id]) => id)).toEqual(["cur"]);
  });

  it("show note from the row menu closes the menu and the palette and focuses the note", async () => {
    initial = [mk("cur", 0), mk("b", 1, { note: "hi" })];
    await openOn("tab:b");
    await key("Tab");
    await wait(20);
    fireEvent.click(menuItem("Show Note") as HTMLElement);
    await wait(30);
    expect(calls.openChange).toContain(false);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(calls.goTo).toEqual(["b"]);
    expect(calls.update.map(([id]) => id)).toEqual(["b"]);
    expect(useTabNoteStore.getState().focusTabId).toBe("b");
  });

  it("hide note toggles in place, leaves the palette open and does not activate the tab", async () => {
    initial = [mk("cur", 0), mk("b", 1, { note: "hi", noteOpen: true })];
    await openOn("tab:b");
    await shortcut("note");
    await wait(30);
    expect(calls.openChange).toEqual([]);
    expect(calls.goTo).toEqual([]);
    expect(useTabNoteStore.getState().focusTabId).toBeNull();
    expect(selected()).toBe("tab:b");
    expect(calls.update.map(([id]) => id)).toEqual(["b"]);
  });

  it("remove note leaves the palette open and does not activate the tab", async () => {
    initial = [mk("cur", 0), mk("b", 1, { note: "hi" })];
    await openOn("tab:b");
    await shortcut("removeNote");
    await wait(30);
    expect(calls.openChange).toEqual([]);
    expect(calls.goTo).toEqual([]);
    expect(useTabNoteStore.getState().focusTabId).toBeNull();
    expect(calls.update.map(([id]) => id)).toEqual(["b"]);
  });

  it("copy closes the palette", async () => {
    await openOn("tab:b");
    await shortcut("copy");
    await wait(30);
    expect(calls.openChange).toContain(false);
  });
});

describe("hibernating from the palette", () => {
  it("leaves the palette open on the same row", async () => {
    await openOn("tab:c");
    await shortcut("hibernateTab");
    await wait(30);
    expect(calls.hibernate).toEqual(["c"]);
    expect(calls.openChange).toEqual([]);
    expect(selected()).toBe("tab:c");
  });

  it("takes the focus back when the hibernate review grabs it, keeping the row", async () => {
    const thief = document.createElement("textarea");
    document.body.appendChild(thief);
    hibernateImpl = () =>
      new Promise((r) =>
        setTimeout(() => {
          thief.focus();
          r(undefined);
        }, 20),
      );
    await openOn("tab:c");
    const input = document.querySelector<HTMLInputElement>('[cmdk-input=""]');
    input?.focus();
    await shortcut("hibernateTab");
    await wait(400);
    thief.remove();
    expect(document.activeElement).toBe(input);
    expect(selected()).toBe("tab:c");
    expect(calls.openChange).toEqual([]);
  });
});

describe("Copy Tab ID from the palette", () => {
  it("shows the id inline and copies the same value as the tab context menu, through the same function", async () => {
    await openOn("tab:c");
    await key("Tab");
    await wait(20);
    const item = menuItem("Copy Tab ID") as HTMLElement;
    expect(item.textContent).toContain("c");
    expect(item.querySelector(".font-mono")?.textContent).toBe("c");
    fireEvent.click(item);
    await wait(30);
    expect(writeClipboardText).toHaveBeenCalledWith("c");
    expect(calls.openChange).toContain(false);
  });
});

describe("Move to Workspace from the palette", () => {
  it("moves the highlighted tab, not the active one, to the picked workspace", async () => {
    await openOn("tab:c");
    await key("Tab");
    await wait(20);
    fireEvent.click(menuItem("Move to Workspace") as HTMLElement);
    await wait(30);
    expect(document.body.textContent).toContain("Move tab to workspace");
    const target = document.querySelector('[cmdk-item][data-value="move-workspace:other"]');
    expect(target).not.toBeNull();
    expect(document.querySelector('[cmdk-item][data-value="move-workspace:ws"]')).toBeNull();
    fireEvent.click(target as Element);
    await wait(30);
    expect(calls.move).toEqual([[{ tabId: "c", workspaceId: "ws" }, "other"]]);
    expect(calls.openChange).toContain(false);
  });

  it("goes back to the row it started from", async () => {
    await openOn("tab:c");
    await key("Tab");
    await wait(20);
    fireEvent.click(menuItem("Move to Workspace") as HTMLElement);
    await wait(30);
    fireEvent.click(document.querySelector('[cmdk-item][data-value="move-workspace:back"]') as Element);
    await wait(50);
    expect(selected()).toBe("tab:c");
  });
});

describe("Back from the Move tab to workspace command", () => {
  it("returns to the first row, which is the active tab", async () => {
    commands = [{ id: "tab.moveToWorkspace", title: "Move tab to workspace...", group: "Tabs", run: () => {} }];
    render(<Harness />);
    await wait(50);
    const opened = selected();
    const row = document.querySelector('[cmdk-item][data-value^="cmd:"]');
    expect(row).not.toBeNull();
    fireEvent.click(row as Element);
    await wait(30);
    expect(document.body.textContent).toContain("Move tab to workspace");
    fireEvent.click(document.querySelector('[cmdk-item][data-value="move-workspace:back"]') as Element);
    await wait(50);
    expect(opened).toBe("tab:cur");
    expect(selected()).toBe(opened);
  });
});

describe("note details", () => {
  it.each([
    ["adding a note", {}, "note"],
    ["hiding a note", { note: "hi", noteOpen: true }, "note"],
    ["removing a note", { note: "hi" }, "removeNote"],
  ] as const)("flushes the pending note text before %s", async (_n, tab, item) => {
    initial = [mk("cur", 0), mk("b", 1, tab)];
    const flush = vi.fn();
    const off = registerTabNoteFlush("b", flush);
    await openOn("tab:b");
    await shortcut(item);
    await wait(30);
    off();
    expect(flush).toHaveBeenCalledTimes(1);
  });
});

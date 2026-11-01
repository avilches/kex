// @vitest-environment happy-dom

import { Command, CommandList } from "@/components/ui/command";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { displayOrder } from "./lib/closeSuccessor";
import type { MergedRow } from "./lib/mergeRows";
import { COMMAND_GROUPS } from "./commands";
import type { TabEntry, WorkspaceEntry } from "./lib/tabEntries";
import { MergedList } from "./MergedList";
import type { PaletteItem } from "./types";

vi.mock("@/modules/shortcuts", () => ({ getShortcutLabel: () => null }));

afterEach(cleanup);

const item = (id: string, title: string, group: string): PaletteItem => ({
  id,
  title,
  group,
  run: () => {},
});
const tab: TabEntry = {
  tabId: "t1",
  workspaceId: "w",
  workspaceTitle: "Work",
  workspaceColor: null,
  workspaceIcon: null, workspaceRoot: null,
  hibernated: false,
  kind: "terminal",
  title: "my tab",
  note: null,
  cwd: "",
  detail: "",
  worktree: "",
  branch: "",
  process: "",
  command: "",
  agent: "",
  indicator: null,
  tab: { id: "t1", kind: "terminal" },
  agentSession: undefined,
  running: false,
  lastUsedAt: 0,
  order: 0,
};

function mount(rows: MergedRow[], typing: boolean) {
  return render(
    <Command shouldFilter={false}>
      <CommandList>
        <MergedList
          rows={rows}
          typing={typing}
          term=""
          userShortcuts={{} as never}
          onRunCommand={vi.fn()}
          onRunTab={vi.fn()}
          onRunWorkspace={vi.fn()}
          onRunClosed={vi.fn()}
          onRunAction={vi.fn()}
        />
      </CommandList>
    </Command>,
  );
}

const titles = () =>
  screen.getAllByRole("option").map((o) => o.textContent ?? "");

describe("MergedList", () => {
  const rows: MergedRow[] = [
    {
      kind: "command",
      key: "cmd:s",
      item: item("s", "Appearance settings", "Settings"),
    },
    { kind: "tab", key: "tab:t1", entry: tab },
    {
      kind: "command",
      key: "cmd:g",
      item: item("g", "Open settings", "General"),
    },
  ];

  it("while typing, renders rows in the ranked order whatever their kind or group", () => {
    mount(rows, true);
    const t = titles();
    expect(t[0]).toContain("Appearance settings");
    expect(t[1]).toContain("my tab");
    expect(t[2]).toContain("Open settings");
  });

  it("while typing, shows no group headings", () => {
    mount(rows, true);
    expect(screen.queryByText("General")).toBeNull();
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("with an empty box, shows recent tabs first and actions under their fixed groups", () => {
    mount(rows, false);
    const t = titles();
    expect(t[0]).toContain("my tab");
    expect(t.findIndex((x) => x.includes("Open settings"))).toBeLessThan(
      t.findIndex((x) => x.includes("Appearance settings")),
    );
    expect(screen.getByText("Recent")).toBeTruthy();
  });

  it("names an action group after what the actions act on, so it never reads as a row kind", () => {
    mount(rows, false);
    expect(screen.getByText("General actions")).toBeTruthy();
    expect(screen.getByText("Settings actions")).toBeTruthy();
    expect(screen.queryByText("General")).toBeNull();
  });

  it("draws the current tab under its own heading, before the recent tabs", () => {
    const other = { ...tab, tabId: "t2", tab: { id: "t2", kind: "terminal" as const } };
    const withCurrent: MergedRow[] = [
      { kind: "tab", key: "tab:t1", entry: tab, current: true },
      { kind: "tab", key: "tab:t2", entry: other },
    ];
    mount(withCurrent, false);
    expect(screen.getByText("Current tab")).toBeTruthy();
    expect(screen.getByText("Recent")).toBeTruthy();
    cleanup();
    mount(withCurrent, true);
    expect(screen.getByText("Current tab")).toBeTruthy();
    expect(screen.queryByText("Recent")).toBeNull();
  });

  it("splits the tabs into Need attention, Busy agents and Recent, and omits the empty ones", () => {
    const mk = (id: string, indicator: TabEntry["indicator"]): MergedRow => ({
      kind: "tab",
      key: `tab:${id}`,
      entry: { ...tab, tabId: id, title: id, indicator, tab: { id, kind: "terminal" } },
    });
    mount([mk("asks", "attention"), mk("fails", "error"), mk("works", "working"), mk("plain", null)], false);
    const text = document.body.textContent ?? "";
    expect(text.indexOf("Need attention")).toBeLessThan(text.indexOf("asks"));
    expect(text.indexOf("asks")).toBeLessThan(text.indexOf("fails"));
    expect(text.indexOf("fails")).toBeLessThan(text.indexOf("Busy agents"));
    expect(text.indexOf("Busy agents")).toBeLessThan(text.indexOf("works"));
    expect(text.indexOf("works")).toBeLessThan(text.indexOf("Recent"));
    expect(text.indexOf("Recent")).toBeLessThan(text.indexOf("plain"));
    cleanup();
    mount([mk("plain", null)], false);
    expect(screen.queryByText("Running commands")).toBeNull();
    expect(screen.queryByText("Need attention")).toBeNull();
    expect(screen.queryByText("Busy agents")).toBeNull();
  });

  it("draws a Running commands section between Busy agents and Recent", () => {
    const mk = (id: string, over: Partial<TabEntry>): MergedRow => ({
      kind: "tab",
      key: `tab:${id}`,
      entry: { ...tab, tabId: id, title: id, tab: { id, kind: "terminal" }, ...over },
    });
    mount([mk("plain", { indicator: null }), mk("dev", { indicator: null, running: true }), mk("works", { indicator: "working" })], false);
    const text = document.body.textContent ?? "";
    expect(text.indexOf("Busy agents")).toBeLessThan(text.indexOf("Running commands"));
    expect(text.indexOf("Running commands")).toBeLessThan(text.indexOf("dev"));
    expect(text.indexOf("dev")).toBeLessThan(text.indexOf("Recent"));
  });

  it("draws the active workspace as a row marked active, next to the others", () => {
    const wsEntry = (id: string, title: string): WorkspaceEntry => ({
      workspaceId: id,
      title,
      color: null,
      icon: null,
      tabCount: 2,
      root: null,
      canHibernate: false,
      lastUsedAt: 0,
    });
    mount(
      [
        { kind: "workspace", key: "ws:a", entry: wsEntry("a", "Alpha"), current: true },
        { kind: "workspace", key: "ws:b", entry: wsEntry("b", "Beta") },
      ],
      true,
    );
    const t = titles();
    expect(t).toHaveLength(2);
    expect(t[0]).toContain("active, 2 tabs");
    expect(t[1]).not.toContain("active");
  });

  it("leaves no empty group while typing when the current tab is the only result", () => {
    mount([{ kind: "tab", key: "tab:t1", entry: tab, current: true }], true);
    expect(document.querySelectorAll("[cmdk-group]")).toHaveLength(1);
  });

  it("draws the idle rows in the order displayOrder predicts", () => {
    const hibernated = {
      ...tab,
      tabId: "t3",
      hibernated: true,
      tab: { id: "t3", kind: "terminal" as const },
    };
    const mixed: MergedRow[] = [
      { kind: "command", key: "cmd:s", item: item("s", "Appearance", "Settings") },
      { kind: "tab", key: "tab:t3", entry: hibernated },
      { kind: "command", key: "cmd:g", item: item("g", "Open", "General") },
      { kind: "tab", key: "tab:t1", entry: tab, current: true },
    ];
    mount(mixed, false);
    const drawn = [...document.querySelectorAll("[cmdk-item]")].map((x) =>
      x.getAttribute("data-value"),
    );
    expect(drawn).toEqual(displayOrder(mixed, false, COMMAND_GROUPS).map((r) => r.key));
  });
});

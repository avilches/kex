// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TabEntry } from "@/modules/command-palette";
import { cancelSwitcher, openSwitcher, useSwitcherStore } from "./lib/switcherController";
import { TabSwitcher } from "./TabSwitcher";

const entry = (over: Partial<TabEntry> = {}): TabEntry => ({
  tabId: "tab-1",
  workspaceId: "ws-1",
  workspaceTitle: "Work",
  workspaceColor: null,
  workspaceIcon: null,
  workspaceRoot: null,
  hibernated: false,
  kind: "terminal",
  title: "zsh",
  note: null,
  cwd: "/p/Kex",
  detail: "",
  worktree: "",
  branch: "",
  process: "",
  command: "",
  agent: "",
  indicator: null,
  tab: { id: "tab-1", kind: "terminal" },
  agentSession: undefined,
  running: false,
  lastUsedAt: 0,
  order: 0,
  ...over,
});

// The switcher never opens with fewer than two tabs, so a single one gets a neighbour.
function show(entries: TabEntry[], index = 0) {
  if (entries.length < 2) entries = [...entries, entry({ tabId: "other", title: "other", workspaceTitle: "Other" })];
  openSwitcher(new KeyboardEvent("keydown", { ctrlKey: true }), 1, entries, () => {});
  act(() => useSwitcherStore.setState({ revealed: true, index }));
  return render(<TabSwitcher />);
}

const tiles = () => screen.getAllByRole("option");
const footer = () => screen.getByTestId("tab-switcher-footer");

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  cancelSwitcher();
});

describe("TabSwitcher tile", () => {
  it("marks a hibernated tab with the sleeping icon instead of a word", () => {
    show([entry({ tabId: "a", hibernated: true }), entry({ tabId: "b" })], 1);
    const [a, b] = tiles();
    expect(within(a).getByLabelText("Tab is hibernated")).toBeTruthy();
    expect(within(b).queryByLabelText("Tab is hibernated")).toBeNull();
    expect(screen.queryByText(/hibernated/i)).toBeNull();
  });

  it("keeps every tile the same height whatever the title length", () => {
    show([entry({ tabId: "a", title: "x" }), entry({ tabId: "b", title: "a very long title ".repeat(8) })]);
    const [a, b] = tiles();
    const height = (t: HTMLElement) => /(?:^| )(h-\[[^\]]+\])/.exec(t.className)?.[1];
    expect(height(a)).toBeTruthy();
    expect(height(a)).toBe(height(b));
    expect(a.className).not.toMatch(/min-h-|\bh-auto\b/);
  });

  it("keeps room around the selected tile when the grid scrolls to it", () => {
    show([entry({ tabId: "a" }), entry({ tabId: "b" })]);
    for (const t of tiles()) {
      expect(t.className).toContain("scroll-mt-");
      expect(t.className).toContain("scroll-mb-");
    }
  });
});

describe("TabSwitcher footer", () => {
  it("draws the tab icon before the title, like the tab strip", () => {
    show([entry({ title: "My terminal" })]);
    const title = within(footer()).getByText("My terminal");
    expect(title.parentElement?.querySelector("[data-tab-icon]")).toBeTruthy();
  });

  it("draws the workspace mark before its name, with its color", () => {
    show([entry({ workspaceTitle: "Kex", workspaceColor: "#ef4444" })]);
    const name = within(footer()).getByText("Kex");
    expect(name.parentElement?.querySelector("svg")).toBeTruthy();
  });

  it("shows the hibernated icon next to the title and never the word", () => {
    show([entry({ hibernated: true })]);
    expect(within(footer()).getByLabelText("Tab is hibernated")).toBeTruthy();
    expect(footer().textContent).not.toMatch(/hibernated/i);
  });

  it("keeps the workspace out of the detail line, since it has its own", () => {
    show([entry({ workspaceTitle: "Kex", detail: "/p/Kex" })]);
    expect(within(footer()).getAllByText(/Kex/)).toHaveLength(2);
    expect(within(footer()).getByText("/p/Kex")).toBeTruthy();
  });

  it("sits the workspace right under a title with no detail", () => {
    show([entry({ workspaceTitle: "Kex", detail: "" })]);
    expect(within(footer()).getByText("Kex")).toBeTruthy();
    expect(footer().querySelectorAll("[data-footer-line]")).toHaveLength(2);
  });
});

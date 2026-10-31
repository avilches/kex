// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TabEntry } from "@/modules/command-palette";
import { cancelSwitcher, openSwitcher, useSwitcherStore } from "./lib/switcherController";
import { GRID_GAP, GRID_PAD, TILE_HEIGHT } from "./lib/switcherModel";
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

  it("has no CSS hover on an unselected tile, since the browser fires it under a resting pointer and the keyboard never clears it", () => {
    show([entry({ tabId: "a" }), entry({ tabId: "b" })], 0);
    const [, b] = tiles();
    expect(b.className).not.toMatch(/hover:/);
  });

  it("keeps every tile the same height whatever the title length", () => {
    show([entry({ tabId: "a", title: "x" }), entry({ tabId: "b", title: "a very long title ".repeat(8) })]);
    const [a, b] = tiles();
    expect(a.style.height).toBe(`${TILE_HEIGHT}px`);
    expect(b.style.height).toBe(a.style.height);
    expect(a.className).not.toMatch(/min-h-|\bh-auto\b/);
  });

  it("lets the tile reach the edge of the scroller, so a scroll stop never shows a strip of its neighbour", () => {
    show([entry({ tabId: "a" }), entry({ tabId: "b" })]);
    for (const t of tiles()) {
      expect(t.style.scrollMarginTop).toBe("");
      expect(t.style.scrollMarginBottom).toBe("");
    }
  });
});

describe("TabSwitcher grid", () => {
  // happy-dom lays nothing out, so the two numbers the hook reads are faked.
  function withLayout(columns: number, footer: number, run: () => void) {
    const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    const computed = window.getComputedStyle;
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => footer });
    window.getComputedStyle = ((el: Element) => {
      const style = computed(el);
      return el.hasAttribute("data-tab-switcher-grid")
        ? ({ gridTemplateColumns: Array(columns).fill("120px").join(" ") } as CSSStyleDeclaration)
        : style;
    }) as typeof window.getComputedStyle;
    try {
      run();
    } finally {
      window.getComputedStyle = computed;
      if (offset) Object.defineProperty(HTMLElement.prototype, "offsetHeight", offset);
      else delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
    }
  }

  it("fixes the scroller to whole rows once it appears, not only when the tab count changes", () => {
    const many = Array.from({ length: 21 }, (_, i) => entry({ tabId: `t${i}` }));
    withLayout(6, 57, () => {
      // opened while still hidden, as a session starts: nothing can be measured yet
      openSwitcher(new KeyboardEvent("keydown", { ctrlKey: true }), 1, many, () => {});
      const view = render(<TabSwitcher />);
      expect(document.querySelector("[data-tab-switcher-grid]")).toBeNull();
      act(() => useSwitcherStore.setState({ revealed: true, index: 1 }));
      view.rerender(<TabSwitcher />);
      const grid = document.querySelector("[data-tab-switcher-grid]") as HTMLElement;
      const rows = (parseInt(grid.style.height, 10) + GRID_GAP) / (TILE_HEIGHT + GRID_GAP);
      expect(Number.isInteger(rows)).toBe(true);
      expect(rows).toBeGreaterThanOrEqual(1);
    });
  });

  it("leaves a short list to its content, with no fixed height and no scroll", () => {
    withLayout(6, 57, () => {
      show([entry({ tabId: "a" }), entry({ tabId: "b" })]);
      const grid = document.querySelector("[data-tab-switcher-grid]") as HTMLElement;
      expect(grid.style.height).toBe("");
    });
  });

  it("puts the padding on a wrapper, not on the scroller, and uses the shared gap", () => {
    show([entry({ tabId: "a" }), entry({ tabId: "b" })]);
    const grid = document.querySelector("[data-tab-switcher-grid]") as HTMLElement;
    expect(grid.style.gap).toBe(`${GRID_GAP}px`);
    expect(grid.style.padding).toBe("");
    expect((grid.parentElement as HTMLElement).style.padding).toBe(`${GRID_PAD}px`);
  });
});

describe("TabSwitcher key hints", () => {
  const hints = () => screen.getByTestId("tab-switcher-hints");

  function showWith(hooks: Parameters<typeof openSwitcher>[4]) {
    openSwitcher(new KeyboardEvent("keydown", { ctrlKey: true }), 1, [entry({ tabId: "a" }), entry({ tabId: "b" })], () => {}, hooks);
    act(() => useSwitcherStore.setState({ revealed: true, index: 1 }));
    return render(<TabSwitcher />);
  }

  it("lists the keys that work, with the letter of the hibernate shortcut", () => {
    showWith({ onClose: () => undefined, onSleep: () => undefined, sleepKey: "z" });
    expect(hints().textContent).toMatch(/W\s*close/i);
    expect(hints().textContent).toMatch(/Z\s*hibernate/i);
  });

  it("follows a rebinding: the hint shows the letter it was given", () => {
    showWith({ onClose: () => undefined, onSleep: () => undefined, sleepKey: "h" });
    expect(hints().textContent).toMatch(/H\s*hibernate/i);
    expect(hints().textContent).not.toMatch(/Z\s*hibernate/i);
  });

  it("does not announce a key that is off", () => {
    showWith({ onClose: () => undefined, onSleep: () => undefined, sleepKey: null });
    expect(hints().textContent).not.toMatch(/hibernate/i);
    expect(hints().textContent).toMatch(/W\s*close/i);
  });

  it("says restore instead of hibernate when the highlighted tab is asleep", () => {
    openSwitcher(
      new KeyboardEvent("keydown", { ctrlKey: true }),
      1,
      [entry({ tabId: "a" }), entry({ tabId: "b", hibernated: true })],
      () => {},
      { onSleep: () => undefined, sleepKey: "z" },
    );
    act(() => useSwitcherStore.setState({ revealed: true, index: 1 }));
    render(<TabSwitcher />);
    expect(hints().textContent).toMatch(/Z\s*restore/i);
    expect(hints().textContent).not.toMatch(/hibernate/i);
  });

  it("does not offer hibernate for a tab that cannot sleep", () => {
    openSwitcher(
      new KeyboardEvent("keydown", { ctrlKey: true }),
      1,
      [entry({ tabId: "a" }), entry({ tabId: "b", kind: "markdown", tab: { id: "b", kind: "markdown", path: "/p/a.md" } })],
      () => {},
      { onSleep: () => undefined, sleepKey: "z" },
    );
    act(() => useSwitcherStore.setState({ revealed: true, index: 1 }));
    render(<TabSwitcher />);
    expect(hints().textContent).not.toMatch(/Z/);
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
    const dot = name.parentElement?.querySelector(".rounded-\\[2px\\]") as HTMLElement | null;
    expect(dot?.style.backgroundColor).toBeTruthy();
  });

  it("shows the hibernated icon next to the title and never the word", () => {
    show([entry({ hibernated: true })]);
    expect(within(footer()).getByLabelText("Tab is hibernated")).toBeTruthy();
    expect(footer().textContent).not.toMatch(/hibernated/i);
  });

  it("puts the attention or error dot right after the title, and nothing for a tab without one", () => {
    show([entry({ title: "api", indicator: "attention" })]);
    const dot = footer().querySelector("[data-footer-dot]")!;
    expect(dot.className).toContain("bg-amber-400");
    expect(dot.previousElementSibling?.textContent).toBe("api");
    cleanup();
    cancelSwitcher();
    show([entry({ title: "api", indicator: "error" })]);
    expect(footer().querySelector("[data-footer-dot]")!.className).toContain("bg-destructive");
    cleanup();
    cancelSwitcher();
    show([entry({ title: "api", indicator: "working" })]);
    expect(footer().querySelector("[data-footer-dot]")).toBeNull();
    cleanup();
    cancelSwitcher();
    show([entry({ title: "api" })]);
    expect(footer().querySelector("[data-footer-dot]")).toBeNull();
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

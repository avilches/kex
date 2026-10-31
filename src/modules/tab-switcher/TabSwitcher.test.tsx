// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TabEntry } from "@/modules/command-palette";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { cancelSwitcher, openSwitcher, switcherActive, useSwitcherStore } from "./lib/switcherController";
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

  it("puts the dimmed sleeping icon of a tile at the top right with the dot over it, and dims the name", () => {
    show([entry({ tabId: "a", title: "api", hibernated: true, indicator: "attention" }), entry({ tabId: "b" })], 1);
    const [a] = tiles();
    const moon = within(a).getByLabelText("Tab is hibernated");
    const dot = within(a).getByLabelText("Agent needs attention");
    const badge = moon.closest(".-top-1") as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.className).toContain("size-4");
    expect(within(badge).getByLabelText("Agent needs attention").style.width).toBe("6px");
    expect(badge.contains(dot)).toBe(true);
    expect(within(a).getByText("api").className).toContain("opacity-40");
    expect(moon.className).toContain("opacity-40");
    expect(dot.closest(".opacity-40")).toBeNull();
  });

  it("marks a dirty file tile with the blue dot at the top right, and a saved one with nothing", () => {
    const dirty = { id: "a", kind: "editor" as const, path: "/p/a.ts", dirty: true, preview: false };
    show([entry({ tabId: "a", kind: "editor", title: "a.ts", tab: dirty }), entry({ tabId: "b" })], 1);
    const [a, b] = tiles();
    const dot = within(a).getByLabelText("Unsaved changes");
    expect(dot.className).toContain("bg-primary");
    expect(dot.className).toContain("-top-1");
    expect(within(b).queryByLabelText("Unsaved changes")).toBeNull();
  });

  it("keeps the dot of an awake tile at the top right, alone", () => {
    show([entry({ tabId: "a", indicator: "error" }), entry({ tabId: "b" })], 1);
    const [a] = tiles();
    expect(within(a).queryByLabelText("Tab is hibernated")).toBeNull();
    expect(within(a).getByLabelText("Agent needs attention").className).toContain("bg-destructive");
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

describe("TabSwitcher jump numbers", () => {
  it("numbers the first nine tiles by position and leaves the rest bare", () => {
    const many = Array.from({ length: 11 }, (_, i) => entry({ tabId: `t${i}`, title: `tab ${i}` }));
    show(many);
    const numbers = tiles().map((t) => t.querySelector("[data-jump-number]")?.textContent ?? null);
    expect(numbers).toEqual(["⌃1", "⌃2", "⌃3", "⌃4", "⌃5", "⌃6", "⌃7", "⌃8", "⌃9", null, null]);
  });

  it("announces the jump keys in the footer", () => {
    show([entry({ tabId: "a" }), entry({ tabId: "b" })]);
    expect(screen.getByTestId("tab-switcher-hints").textContent).toMatch(/⌃1-9\s*jump/);
  });
});

describe("TabSwitcher live tab", () => {
  const two = [entry({ tabId: "a" }), entry({ tabId: "b" })];
  const open = () => {
    openSwitcher(new KeyboardEvent("keydown", { ctrlKey: true }), 1, two, () => {});
    act(() => useSwitcherStore.setState({ revealed: true, index: 0 }));
  };

  it("draws a lock and the colour of a tab that has them, on its tile and in the footer", () => {
    show([entry({ tabId: "a", tab: { id: "a", kind: "terminal", locked: true, color: "#ff0000" } }), entry({ tabId: "b" })]);
    const [a, b] = tiles();
    expect(within(a).getByLabelText("Tab is locked")).toBeTruthy();
    expect(a.querySelector<HTMLElement>(".size-11")?.style.color).toBe("#ff0000");
    expect(within(footer()).getByLabelText("Tab is locked")).toBeTruthy();
    expect(within(b).queryByLabelText("Tab is locked")).toBeNull();
    expect(b.querySelector<HTMLElement>(".size-11")?.style.color).toBe("");
  });

  it("tints the icon of a coloured tab, whether or not it has a chosen icon, and draws no stripe or bar", () => {
    show([
      entry({ tabId: "a", tab: { id: "a", kind: "terminal", icon: "Home01Icon", color: "#ff0000" } }),
      entry({ tabId: "b", tab: { id: "b", kind: "terminal", color: "#00ff00" } }),
    ]);
    const [a, b] = tiles();
    expect(a.querySelector<HTMLElement>(".size-11")?.style.color).toBe("#ff0000");
    expect(b.querySelector<HTMLElement>(".size-11")?.style.color).toBe("#00ff00");
    expect(footer().querySelector<HTMLElement>("[data-tab-icon]")?.style.color).toBe("#ff0000");
    expect(document.querySelector("[data-tab-color]")).toBeNull();
  });

  it("follows the live tab instead of the snapshot, so Lock, Color and Icon change in place", () => {
    open();
    const live: Record<string, TabEntry["tab"]> = {};
    const view = render(<TabSwitcher liveTab={(id) => live[id]} />);
    expect(screen.queryByLabelText("Tab is locked")).toBeNull();
    live.a = { id: "a", kind: "terminal", locked: true, color: "#00ff00" };
    view.rerender(<TabSwitcher liveTab={(id) => live[id]} />);
    expect(within(tiles()[0]).getByLabelText("Tab is locked")).toBeTruthy();
    expect(within(footer()).getByLabelText("Tab is locked")).toBeTruthy();
    expect(tiles()[0].querySelector<HTMLElement>(".size-11")?.style.color).toBe("#00ff00");
    live.a = { id: "a", kind: "terminal" };
    view.rerender(<TabSwitcher liveTab={(id) => live[id]} />);
    expect(screen.queryByLabelText("Tab is locked")).toBeNull();
  });
});

describe("TabSwitcher tile menu", () => {
  function showMenu(renderMenu = (e: TabEntry) => <div role="menuitem" tabIndex={-1}>menu of {e.tabId}</div>) {
    openSwitcher(new KeyboardEvent("keydown", { ctrlKey: true }), 1, [entry({ tabId: "a" }), entry({ tabId: "b" })], () => {});
    act(() => useSwitcherStore.setState({ revealed: true, index: 0 }));
    return render(<TabSwitcher renderMenu={renderMenu} />);
  }

  it("opens the app's menu for the tile that was right clicked and highlights it", () => {
    showMenu();
    fireEvent.contextMenu(tiles()[1]);
    expect(screen.getByRole("menuitem").textContent).toBe("menu of b");
    expect(useSwitcherStore.getState().index).toBe(1);
    expect(switcherActive()).toBe(true);
  });

  it("Escape closes the menu and keeps the overlay, and a second Escape closes the overlay", () => {
    showMenu();
    fireEvent.contextMenu(tiles()[1]);
    expect(screen.getAllByRole("option", { hidden: true }).length).toBe(2);
    fireEvent.keyDown(screen.getByRole("menuitem"), { key: "Escape" });
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(switcherActive()).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(switcherActive()).toBe(false);
  });

  it("opens the menu on a right click with Ctrl held, and the system menu is prevented", () => {
    showMenu();
    const opened = fireEvent.contextMenu(tiles()[1], { ctrlKey: true });
    expect(opened).toBe(false);
    expect(screen.getByRole("menuitem").textContent).toBe("menu of b");
  });

  it("Escape on the menu with Ctrl held leaves the overlay open and the menu gone", () => {
    openSwitcher(new KeyboardEvent("keydown", { ctrlKey: true }), 1, [entry({ tabId: "a" }), entry({ tabId: "b" })], () => {});
    act(() => useSwitcherStore.setState({ revealed: true, index: 0 }));
    render(<TabSwitcher renderMenu={(e) => <div role="menuitem" tabIndex={-1}>menu of {e.tabId}</div>} />);
    fireEvent.contextMenu(tiles()[1], { ctrlKey: true });
    fireEvent.keyDown(screen.getByRole("menuitem"), { key: "Escape", ctrlKey: true });
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(switcherActive()).toBe(true);
    expect(tiles().length).toBe(2);
  });

  it("Escape with Ctrl held still keeps the overlay after an item that leaves the menu open, as Lock does", () => {
    openSwitcher(new KeyboardEvent("keydown", { ctrlKey: true }), 1, [entry({ tabId: "a" }), entry({ tabId: "b" })], () => {});
    act(() => useSwitcherStore.setState({ revealed: true, index: 0 }));
    let locked = false;
    const live = (id: string) => (id === "b" ? ({ id: "b", kind: "terminal", locked } as TabEntry["tab"]) : undefined);
    const ui = () => (
      <TabSwitcher
        liveTab={live}
        renderMenu={() => (
          <ContextMenuItem
            onSelect={(e) => {
              e.preventDefault();
              locked = !locked;
            }}
          >
            {locked ? "Unlock" : "Lock"}
          </ContextMenuItem>
        )}
      />
    );
    const view = render(ui());
    fireEvent.contextMenu(tiles()[1], { ctrlKey: true });
    fireEvent.click(screen.getByRole("menuitem"));
    view.rerender(ui());
    expect(screen.getByRole("menuitem").textContent).toBe("Unlock");
    fireEvent.keyDown(screen.getByRole("menuitem"), { key: "Escape", ctrlKey: true });
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(switcherActive()).toBe(true);
  });

  it("has no menu when the app gives none", () => {
    show([entry({ tabId: "a" }), entry({ tabId: "b" })]);
    fireEvent.contextMenu(tiles()[1]);
    expect(screen.queryByRole("menuitem")).toBeNull();
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

  it("puts the attention or error dot, or the spinner of a working agent, right after the title, and nothing for a tab without one", () => {
    show([entry({ title: "api", indicator: "attention" })]);
    const dot = footer().querySelector("[data-indicator-dot]")!;
    expect(dot.className).toContain("bg-amber-400");
    expect(dot.previousElementSibling?.textContent).toBe("api");
    cleanup();
    cancelSwitcher();
    show([entry({ title: "api", indicator: "error" })]);
    expect(footer().querySelector("[data-indicator-dot]")!.className).toContain("bg-destructive");
    cleanup();
    cancelSwitcher();
    show([entry({ title: "api", indicator: "working" })]);
    expect(footer().querySelector("[data-indicator-dot]")).toBeNull();
    expect(within(footer()).getByRole("status")).toBeTruthy();
    cleanup();
    cancelSwitcher();
    show([entry({ title: "api" })]);
    expect(footer().querySelector("[data-indicator-dot]")).toBeNull();
  });

  it("lays the dot over the dimmed hibernated icon after the name, and dims the name", () => {
    show([entry({ title: "api", hibernated: true, indicator: "attention" })]);
    const title = within(footer()).getByText("api");
    const icon = within(footer()).getByLabelText("Tab is hibernated");
    const dot = footer().querySelector("[data-indicator-dot]")!;
    expect(title.nextElementSibling).toBe(icon.parentElement);
    expect(icon.parentElement!.contains(dot)).toBe(true);
    expect(title.className).toContain("opacity-40");
    expect(icon.className).toContain("opacity-40");
    expect(dot.className).not.toContain("opacity");
  });

  it("puts the blue unsaved dot right after the name in the footer of a dirty file", () => {
    const dirty = { id: "a", kind: "editor" as const, path: "/p/a.ts", dirty: true, preview: false };
    show([entry({ tabId: "a", kind: "editor", title: "a.ts", tab: dirty })]);
    const dot = within(footer()).getByLabelText("Unsaved changes");
    expect(within(footer()).getByText("a.ts").nextElementSibling).toBe(dot);
  });

  it("does not dim the name of a tab that is awake", () => {
    show([entry({ title: "api" })]);
    expect(within(footer()).getByText("api").className).not.toContain("opacity");
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

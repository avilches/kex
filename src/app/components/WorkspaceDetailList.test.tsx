// @vitest-environment happy-dom
import { act, createElement } from "react";
import { DndContext } from "@dnd-kit/core";
import { createRoot as createDomRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAgentEntries } from "@/modules/agents/lib/notificationList";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { useTabRenameStore } from "@/modules/workspaces/lib/tabRenameStore";
import type { Tab } from "@/modules/workspaces/lib/types";
import { SidebarTabMenuProvider } from "@/modules/workspaces/SidebarTabMenuContext";
import type { DetailFilter } from "@/modules/workspaces/lib/workspaceDetail";
import { WorkspaceDetailList } from "./WorkspaceDetailList";

vi.mock("@/modules/theme/ThemeProvider", () => ({ useTheme: () => ({ resolvedMode: "dark" }) }));

// The rows register with dnd-kit, so they always render inside a DndContext in the app.
function createRoot(container: Element) {
  const root = createDomRoot(container);
  const render = root.render.bind(root);
  root.render = (el) => render(createElement(DndContext, null, el));
  return root;
}

const liveRoots = new Set<ReturnType<typeof createDomRoot>>();

function track(root: ReturnType<typeof createDomRoot>) {
  liveRoots.add(root);
  return () =>
    act(() => {
      if (liveRoots.delete(root)) root.unmount();
    });
}

const wrap = (b: Element) => b.closest(".group\\/tab") as Element;
const rowName = (b: Element) => b.querySelector(".truncate")?.textContent;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tabs: Tab[] = [
  { id: "t-work", kind: "terminal", title: "api" },
  { id: "t-wait", kind: "terminal", title: "web" },
  { id: "t-idle", kind: "terminal", title: "docs" },
  { id: "t-plain", kind: "terminal", title: "shell" },
  { id: "t-edit", kind: "editor", title: "notes", path: "/x/notes.md", dirty: false, preview: false },
];

const base: DetailFilter = { terminals: "all", editors: false, browsers: false, git: false };

function mount(filter: Partial<DetailFilter>, focusedTabId: string | null = null, onActivate = vi.fn()) {
  const sessions = useAgentStore.getState().sessions;
  const entries = buildAgentEntries(sessions, [], null);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(WorkspaceDetailList, {
        workspaceId: "ws-1",
        tabs,
        entries,
        filter: { ...base, ...filter },
        focusedTabId,
        onActivate,
      }),
    );
  });
  const rows = () => Array.from(container.querySelectorAll<HTMLButtonElement>("button[data-detail-row]"));
  return { container, rows, onActivate, unmount: track(root) };
}

function resetAgents() {
  useAgentStore.setState({ sessions: {}, notifications: [], closedSessions: {} });
}

beforeEach(() => {
  resetAgents();
  const s = useAgentStore.getState();
  s.start("t-work", "ws", "claude");
  s.start("t-wait", "ws", "claude");
  s.setStatus("t-wait", "attention");
  s.startIdle("t-idle", "ws", "claude");
});

afterEach(() => {
  for (const root of liveRoots) act(() => root.unmount());
  liveRoots.clear();
  resetAgents();
  document.body.innerHTML = "";
});

describe("WorkspaceDetailList", () => {
  it("all terminals lists every terminal, with a spinner for working and an amber dot for waiting", () => {
    const { rows, unmount } = mount({ terminals: "all" });
    expect(rows().map((b) => rowName(b))).toEqual(["api", "web", "docs", "shell"]);
    expect(wrap(rows()[0]).querySelector(".animate-spin")).not.toBeNull();
    expect(wrap(rows()[1]).querySelector(".bg-amber-400")).not.toBeNull();
    expect(wrap(rows()[2]).querySelector(".animate-spin, .bg-amber-400, .bg-destructive")).toBeNull();
    expect(wrap(rows()[3]).querySelector(".animate-spin, .bg-amber-400, .bg-destructive")).toBeNull();
    unmount();
  });

  it("agents lists the terminals with an agent, including the idle one", () => {
    const { rows, unmount } = mount({ terminals: "agents" });
    expect(rows().map((b) => rowName(b))).toEqual(["api", "web", "docs"]);
    unmount();
  });

  it("active agents lists only working and waiting agents, waiting first", () => {
    const { rows, unmount } = mount({ terminals: "active-agents" });
    expect(rows().map((b) => rowName(b))).toEqual(["web", "api"]);
    unmount();
  });

  it("include editors adds the editor tab even with no terminals", () => {
    const { rows, unmount } = mount({ terminals: "none", editors: true });
    expect(rows().map((b) => rowName(b))).toEqual(["notes"]);
    unmount();
  });

  it("clicking a row activates that tab", () => {
    const { rows, onActivate, unmount } = mount({ terminals: "active-agents" });
    act(() => rows()[1].click());
    expect(onActivate).toHaveBeenCalledWith("t-work");
    unmount();
  });

  it("renders nothing when there is nothing to list", () => {
    resetAgents();
    const { container, unmount } = mount({ terminals: "active-agents" });
    expect(container.querySelector("button")).toBeNull();
    unmount();
  });
});

describe("WorkspaceDetailList row controls", () => {
  it("renders the close control as a real button beside the row, reachable by keyboard", () => {
    const { container, rows, unmount } = mount({ terminals: "all" });
    const close = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Close tab"]');
    expect(close).toHaveLength(4);
    for (const c of close) {
      expect(c.tabIndex).toBe(0);
      expect(rows().some((r) => r.contains(c))).toBe(false);
    }
    unmount();
  });
});

describe("WorkspaceDetailList focus", () => {
  it("marks only the focused tab with aria-current", () => {
    const { rows, unmount } = mount({ terminals: "all" }, "t-wait");
    expect(rows().map((b) => b.getAttribute("aria-current"))).toEqual([null, "true", null, null]);
    unmount();
  });

  it("marks nothing when no tab is focused", () => {
    const { rows, unmount } = mount({ terminals: "all" }, null);
    expect(rows().every((b) => !b.hasAttribute("aria-current"))).toBe(true);
    unmount();
  });

  it("gives the focused row a stronger look than the others", () => {
    const { rows, unmount } = mount({ terminals: "all" }, "t-work");
    expect(rows()[0].className).toContain("font-medium");
    expect(rows()[1].className).not.toContain("font-medium");
    unmount();
  });
});

describe("WorkspaceDetailList kind icons", () => {
  const icon = (r: Element) => r.querySelector("span.size-3\\.5");

  it("shows an icon on every row when agents are mixed with other tabs", () => {
    const { rows, unmount } = mount({ terminals: "all", editors: true });
    expect(rows()).toHaveLength(5);
    for (const r of rows()) expect(icon(r)).not.toBeNull();
    unmount();
  });

  it("shows an icon on every row without agents, even when every row is a plain terminal", () => {
    resetAgents();
    const { rows, unmount } = mount({ terminals: "all" });
    expect(rows().length).toBeGreaterThan(0);
    for (const r of rows()) expect(icon(r)).not.toBeNull();
    unmount();
  });
});

describe("WorkspaceDetailList subagents", () => {
  const subagentButtons = (c: Element) =>
    Array.from(c.querySelectorAll<HTMLElement>("[data-subagent-row]"));

  it("lists the subagents of an agent tab under its row, labelled and in start order", () => {
    const { container, rows, unmount } = mount({ terminals: "all" });
    act(() =>
      useAgentStore.getState().reconcileSubagents("t-work", [
        { id: "a1", agentType: "Explore", description: "Scan the repo" },
        { id: "a2", agentType: "general-purpose", description: "" },
      ]),
    );
    expect(rows().map((b) => rowName(b))).toEqual(["api", "web", "docs", "shell"]);
    const subs = subagentButtons(container);
    expect(subs.map((b) => b.textContent)).toEqual(["Scan the repo", "general-purpose"]);
    expect(wrap(rows()[0]).nextElementSibling).toBe(subs[0].parentElement);
    expect(subs[0].parentElement).toBe(subs[1].parentElement);
    expect(subs[0].querySelector(".animate-spin")).not.toBeNull();
    unmount();
  });

  it("draws the focus chip around the focused tab and its subagents together", () => {
    const { container, rows, unmount } = mount({ terminals: "all" }, "t-work");
    act(() =>
      useAgentStore
        .getState()
        .reconcileSubagents("t-work", [{ id: "a1", agentType: "Explore", description: "" }]),
    );
    const chip = wrap(rows()[0]).parentElement as HTMLElement;
    expect(chip.style.boxShadow).not.toBe("");
    expect(chip.contains(subagentButtons(container)[0])).toBe(true);
    expect(rows()[0].style.boxShadow).toBe("");
    unmount();
  });

  it("removes a row when its subagent stops", () => {
    const { container, unmount } = mount({ terminals: "all" });
    act(() =>
      useAgentStore
        .getState()
        .reconcileSubagents("t-work", [{ id: "a1", agentType: "Explore", description: "" }]),
    );
    expect(subagentButtons(container)).toHaveLength(1);
    act(() => useAgentStore.getState().subagentStopped("t-work", "a1"));
    expect(subagentButtons(container)).toHaveLength(0);
    unmount();
  });

  it("is not interactive: no button, no hover surface, and the block hover belongs to the wrapper", () => {
    const { container, rows, onActivate, unmount } = mount({ terminals: "all" });
    act(() =>
      useAgentStore
        .getState()
        .reconcileSubagents("t-work", [{ id: "a1", agentType: "Explore", description: "" }]),
    );
    const sub = subagentButtons(container)[0];
    expect(sub.tagName).toBe("DIV");
    expect(sub.className).not.toContain("hover:bg");
    act(() => sub.click());
    expect(onActivate).not.toHaveBeenCalled();
    const block = wrap(rows()[0]).parentElement as HTMLElement;
    expect(block.className).toContain("hover:bg-foreground");
    expect(block.contains(sub)).toBe(true);
    expect(container.querySelectorAll('button[aria-label="Close tab"]')).toHaveLength(4);
    unmount();
  });
});

describe("WorkspaceDetailList context menu", () => {
  const actions = {
    paneTabCount: () => 3,
    onClose: vi.fn(),
    onCloseOtherTabs: vi.fn(),
    onCloseAllTabs: vi.fn(),
    onRenameTab: vi.fn(),
    onUpdateTab: vi.fn(),
    onSaveTab: vi.fn(),
    onRevealInExplorer: vi.fn(),
  };

  function mountWithMenu() {
    const { container, rows, unmount } = mountProvided();
    act(() => {
      rows()[0].dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 4, clientY: 4 }),
      );
    });
    return { container, rows, unmount };
  }

  function mountProvided() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(
          SidebarTabMenuProvider,
          { value: actions },
          createElement(WorkspaceDetailList, {
            workspaceId: "ws-1",
            tabs,
            entries: buildAgentEntries(useAgentStore.getState().sessions, [], null),
            filter: { ...base },
            focusedTabId: null,
            onActivate: vi.fn(),
          }),
        ),
      );
    });
    const rows = () => Array.from(container.querySelectorAll<HTMLButtonElement>("button[data-detail-row]"));
    return { container, rows, unmount: track(root) };
  }

  beforeEach(() => {
    for (const fn of Object.values(actions)) if (vi.isMockFunction(fn)) fn.mockClear();
    useTabRenameStore.setState({ renamingTabId: null, renamingOrigin: "pane", templatesOpen: false });
  });

  it("offers the tab actions and none of the New ones", () => {
    const { unmount } = mountWithMenu();
    const text = document.body.textContent ?? "";
    for (const label of ["Rename Tab", "Lock Tab", "Close Tab", "Close Other Tabs", "Close All Tabs", "Move to Workspace"]) {
      expect(text).toContain(label);
    }
    expect(text).not.toContain("New Terminal");
    expect(text).not.toContain("New Browser");
    unmount();
  });

  it("Close Other Tabs reports the tab the menu was opened on", () => {
    const { unmount } = mountWithMenu();
    const item = (label: string) =>
      Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((e) => e.textContent?.startsWith(label)) as HTMLElement;
    act(() => item("Close Other Tabs").click());
    expect(actions.onCloseOtherTabs).toHaveBeenCalledWith("t-work");
    unmount();
  });

  it("Rename Tab starts a sidebar rename that opens the field on the row", () => {
    const { unmount } = mountWithMenu();
    const rename = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((e) =>
      e.textContent?.startsWith("Rename Tab"),
    ) as HTMLElement;
    act(() => rename.click());
    expect(useTabRenameStore.getState()).toMatchObject({ renamingTabId: "t-work", renamingOrigin: "sidebar" });
    expect(document.body.textContent).toContain("Rename tab");
    unmount();
  });
});

describe("WorkspaceDetailList hibernated", () => {
  function mountAsleep(onWake = vi.fn(), onActivate = vi.fn()) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(
          SidebarTabMenuProvider,
          {
            value: {
              paneTabCount: () => 3,
              onClose: vi.fn(),
              onCloseOtherTabs: vi.fn(),
              onCloseAllTabs: vi.fn(),
              onRenameTab: vi.fn(),
              onUpdateTab: vi.fn(),
              onSaveTab: vi.fn(),
              onRevealInExplorer: vi.fn(),
            },
          },
          createElement(WorkspaceDetailList, {
            workspaceId: "ws-1",
            tabs: tabs.map((t) => (t.kind === "terminal" ? { ...t, locked: true, note: "n" } : t)),
            entries: [],
            filter: { ...base },
            focusedTabId: null,
            hibernated: true,
            onActivate,
            onWake,
          }),
        ),
      );
    });
    const rows = () => Array.from(container.querySelectorAll<HTMLButtonElement>("button[data-detail-row]"));
    return { container, rows, onWake, onActivate, unmount: track(root) };
  }

  it("has no close, unlock or note controls, but still activates on click", () => {
    const { container, rows, onActivate, unmount } = mountAsleep();
    expect(rows()).toHaveLength(4);
    expect(
      container.querySelector('button[aria-label="Close tab"], button[aria-label="Unlock tab"], button[aria-label="Tab note"]'),
    ).toBeNull();
    act(() => rows()[0].click());
    expect(onActivate).toHaveBeenCalledWith("t-work");
    unmount();
  });

  it("the context menu only offers Restore Workspace", () => {
    const { rows, onWake, unmount } = mountAsleep();
    act(() => {
      rows()[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 4, clientY: 4 }));
    });
    const items = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toMatch(/^Restore Workspace.+/);
    act(() => items[0].click());
    expect(onWake).toHaveBeenCalled();
    unmount();
  });
});

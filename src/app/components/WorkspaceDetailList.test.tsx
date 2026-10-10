// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAgentEntries } from "@/modules/agents/lib/notificationList";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import type { Tab } from "@/modules/workspaces/lib/types";
import type { DetailFilter } from "@/modules/workspaces/lib/workspaceDetail";
import { WorkspaceDetailList } from "./WorkspaceDetailList";

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
        tabs,
        entries,
        filter: { ...base, ...filter },
        focusedTabId,
        onActivate,
      }),
    );
  });
  const rows = () => Array.from(container.querySelectorAll("button"));
  return { container, rows, onActivate, unmount: () => act(() => root.unmount()) };
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
  resetAgents();
  document.body.innerHTML = "";
});

describe("WorkspaceDetailList", () => {
  it("all terminals lists every terminal, with a spinner for working and an amber dot for waiting", () => {
    const { rows, unmount } = mount({ terminals: "all" });
    expect(rows().map((b) => b.textContent)).toEqual(["api", "web", "docs", "shell"]);
    expect(rows()[0].querySelector(".animate-spin")).not.toBeNull();
    expect(rows()[1].querySelector(".bg-amber-400")).not.toBeNull();
    expect(rows()[2].querySelector(".animate-spin, .bg-amber-400, .bg-destructive")).toBeNull();
    expect(rows()[3].querySelector(".animate-spin, .bg-amber-400, .bg-destructive")).toBeNull();
    unmount();
  });

  it("agents lists the terminals with an agent, including the idle one", () => {
    const { rows, unmount } = mount({ terminals: "agents" });
    expect(rows().map((b) => b.textContent)).toEqual(["api", "web", "docs"]);
    unmount();
  });

  it("active agents lists only working and waiting agents, waiting first", () => {
    const { rows, unmount } = mount({ terminals: "active-agents" });
    expect(rows().map((b) => b.textContent)).toEqual(["web", "api"]);
    unmount();
  });

  it("include editors adds the editor tab even with no terminals", () => {
    const { rows, unmount } = mount({ terminals: "none", editors: true });
    expect(rows().map((b) => b.textContent)).toEqual(["notes"]);
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
    expect(container.innerHTML).toBe("");
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

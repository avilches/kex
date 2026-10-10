// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAgentEntries } from "@/modules/agents/lib/notificationList";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import type { Tab } from "@/modules/workspaces/lib/types";
import type { WorkspaceDetailMode } from "@/modules/workspaces/lib/workspaceDetail";
import { WorkspaceDetailList } from "./WorkspaceDetailList";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tabs: Tab[] = [
  { id: "t-work", kind: "terminal", title: "api" },
  { id: "t-wait", kind: "terminal", title: "web" },
  { id: "t-idle", kind: "terminal", title: "docs" },
  { id: "t-edit", kind: "editor", title: "notes", path: "/x/notes.md", dirty: false, preview: false },
];

function mount(mode: WorkspaceDetailMode, onActivate = vi.fn()) {
  const sessions = useAgentStore.getState().sessions;
  const entries = buildAgentEntries(sessions, [], null);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(WorkspaceDetailList, { tabs, entries, mode, onActivate }));
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
  it("all-tabs lists every tab, with a spinner for working and an amber dot for waiting", () => {
    const { rows, unmount } = mount("all-tabs");
    expect(rows().map((b) => b.textContent)).toEqual(["api", "web", "docs", "notes"]);
    expect(rows()[0].querySelector(".animate-spin")).not.toBeNull();
    expect(rows()[1].querySelector(".bg-amber-400")).not.toBeNull();
    expect(rows()[2].querySelector(".animate-spin, .bg-amber-400, .bg-destructive")).toBeNull();
    expect(rows()[3].querySelector(".animate-spin, .bg-amber-400, .bg-destructive")).toBeNull();
    unmount();
  });

  it("agents lists the agent tabs including the idle one, and not the editor", () => {
    const { rows, unmount } = mount("agents");
    expect(rows().map((b) => b.textContent)).toEqual(["api", "web", "docs"]);
    unmount();
  });

  it("active-agents lists only working and waiting agents, waiting first", () => {
    const { rows, unmount } = mount("active-agents");
    expect(rows().map((b) => b.textContent)).toEqual(["web", "api"]);
    unmount();
  });

  it("clicking a row activates that tab", () => {
    const { rows, onActivate, unmount } = mount("active-agents");
    act(() => rows()[1].click());
    expect(onActivate).toHaveBeenCalledWith("t-work");
    unmount();
  });

  it("renders nothing when there is nothing to list", () => {
    resetAgents();
    const { container, unmount } = mount("active-agents");
    expect(container.innerHTML).toBe("");
    unmount();
  });
});

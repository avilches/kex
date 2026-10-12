// @vitest-environment happy-dom
import { act, createElement } from "react";
import { DndContext } from "@dnd-kit/core";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { useTabNoteStore } from "@/modules/workspaces/lib/tabNoteStore";
import type { Tab } from "@/modules/workspaces/lib/types";
import type { DetailFilter } from "@/modules/workspaces/lib/workspaceDetail";
import { WorkspaceDetailList } from "./WorkspaceDetailList";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tabs: Tab[] = [
  { id: "t-a", kind: "terminal", title: "api", note: "remember" },
  { id: "t-b", kind: "terminal", title: "web", note: "other" },
  { id: "t-c", kind: "terminal", title: "docs" },
];
const filter: DetailFilter = { terminals: "all", editors: false, browsers: false, git: false };

const mounted: Array<() => void> = [];

function mount(focusedTabId: string | null) {
  useAgentStore.setState({ sessions: {}, notifications: [], closedSessions: {} });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        DndContext,
        null,
        createElement(WorkspaceDetailList, {
          workspaceId: "ws-1",
          tabs,
          entries: [],
          filter,
          focusedTabId,
          onActivate: () => {},
        }),
      ),
    );
  });
  mounted.push(() => act(() => root.unmount()));
  const noteButton = (id: string) =>
    container.querySelector(`[data-detail-row-id="${id}"]`)?.closest(".group\\/tab")?.querySelector<HTMLButtonElement>('button[aria-label="Tab note"]');
  return { container, noteButton };
}

function hover(el: Element, over: boolean) {
  act(() => {
    el.dispatchEvent(new MouseEvent(over ? "pointerover" : "pointerout", { bubbles: true }));
  });
}

afterEach(() => {
  for (const un of mounted.splice(0)) un();
  document.body.innerHTML = "";
  useTabNoteStore.setState({ sidebarHoverTabId: null });
});

describe("WorkspaceDetailList tab notes", () => {
  it("shows the note icon only on tabs that carry a note", () => {
    const { noteButton } = mount(null);
    expect(noteButton("t-a")).toBeTruthy();
    expect(noteButton("t-b")).toBeTruthy();
    expect(noteButton("t-c")).toBeFalsy();
  });

  it("hovering the icon of the focused tab asks its pane to preview the note", () => {
    const { noteButton } = mount("t-a");
    const btn = noteButton("t-a")!;
    hover(btn, true);
    expect(useTabNoteStore.getState().sidebarHoverTabId).toBe("t-a");
    expect(document.querySelector("[data-tab-note-id]")).toBeNull();
    hover(btn, false);
    expect(useTabNoteStore.getState().sidebarHoverTabId).toBeNull();
  });

  it("hovering the icon of another tab docks its note next to the row", () => {
    const { noteButton } = mount("t-a");
    hover(noteButton("t-b")!, true);
    expect(useTabNoteStore.getState().sidebarHoverTabId).toBeNull();
    expect(document.querySelector('[data-tab-note-id="t-b"]')).not.toBeNull();
  });
});

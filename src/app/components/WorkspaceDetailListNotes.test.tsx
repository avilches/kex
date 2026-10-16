// @vitest-environment happy-dom
import { act, createElement } from "react";
import { DndContext } from "@dnd-kit/core";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { useTabNoteStore } from "@/modules/workspaces/lib/tabNoteStore";
import type { Tab } from "@/modules/workspaces/lib/types";
import type { DetailFilter } from "@/modules/workspaces/lib/workspaceDetail";
import { SidebarTabMenuProvider } from "@/modules/workspaces/SidebarTabMenuContext";
import { WorkspaceDetailList } from "./WorkspaceDetailList";

vi.mock("@/modules/theme/ThemeProvider", () => ({ useTheme: () => ({ resolvedMode: "dark" }) }));
vi.mock("@/modules/theme/useTerminalSurfaceMode", () => ({ useTerminalSurfaceMode: () => "dark" }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseTabs: Tab[] = [
  { id: "t-a", kind: "terminal", title: "api", note: "remember" },
  { id: "t-b", kind: "terminal", title: "web", note: "other" },
  { id: "t-c", kind: "terminal", title: "docs" },
];
const filter: DetailFilter = { terminals: "all", editors: false, browsers: false, git: false };

const mounted: Array<() => void> = [];

function mount(visibleTabIds: string, tabs: Tab[] = baseTabs) {
  useAgentStore.setState({ sessions: {}, notifications: [], closedSessions: {} });
  const onUpdateTab = vi.fn();
  const actions = {
    paneTabCount: () => 1,
    onClose: () => {},
    onCloseOtherTabs: () => {},
    onCloseAllTabs: () => {},
    onRenameTab: () => {},
    onUpdateTab,
    onSaveTab: () => {},
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const draw = (current: Tab[]) =>
    act(() => {
      root.render(
        createElement(
          SidebarTabMenuProvider,
          { value: actions },
          createElement(
            DndContext,
            null,
            createElement(WorkspaceDetailList, {
              workspaceId: "ws-1",
              tabs: current,
              entries: [],
              filter,
              focusedTabId: visibleTabIds.split(",")[0] ?? null,
              visibleTabIds,
              onActivate: () => {},
            }),
          ),
        ),
      );
    });
  draw(tabs);
  mounted.push(() => act(() => root.unmount()));
  const noteButton = (id: string) =>
    container
      .querySelector(`[data-detail-row-id="${id}"]`)
      ?.closest(".group\\/tab")
      ?.querySelector<HTMLButtonElement>('button[aria-label="Tab note"]');
  return { container, noteButton, onUpdateTab, rerender: draw };
}

function hover(el: Element, over: boolean) {
  act(() => {
    el.dispatchEvent(new MouseEvent(over ? "pointerover" : "pointerout", { bubbles: true }));
  });
}

const docked = (id: string) => document.querySelector(`[data-tab-note-id="${id}"]`);
const closeButton = () => document.querySelector('button[aria-label="Close note"]');

afterEach(() => {
  for (const un of mounted.splice(0)) un();
  document.body.innerHTML = "";
  useTabNoteStore.setState({ sidebarHoverTabId: null });
});

describe("WorkspaceDetailList tab notes", () => {
  it("shows the note icon only on tabs that carry a note", () => {
    const { noteButton } = mount("");
    expect(noteButton("t-a")).toBeTruthy();
    expect(noteButton("t-b")).toBeTruthy();
    expect(noteButton("t-c")).toBeFalsy();
  });

  it("hovering the icon of a tab a pane shows asks that pane to preview the note", () => {
    const { noteButton } = mount("t-a");
    const btn = noteButton("t-a")!;
    hover(btn, true);
    expect(useTabNoteStore.getState().sidebarHoverTabId).toBe("t-a");
    expect(docked("t-a")).toBeNull();
    hover(btn, false);
    expect(useTabNoteStore.getState().sidebarHoverTabId).toBeNull();
  });

  it("hovering the icon of a tab no pane shows docks its note next to the row", () => {
    const { noteButton } = mount("t-a");
    hover(noteButton("t-b")!, true);
    expect(useTabNoteStore.getState().sidebarHoverTabId).toBeNull();
    expect(docked("t-b")).not.toBeNull();
    expect(closeButton()).toBeNull();
  });

  it("a docked preview keeps showing after the icon is clicked, which only toggles the note", () => {
    const { noteButton, onUpdateTab } = mount("t-a");
    const btn = noteButton("t-b")!;
    hover(btn, true);
    act(() => btn.click());
    expect(onUpdateTab).toHaveBeenCalledTimes(1);
    expect(onUpdateTab.mock.calls[0][0]).toBe("t-b");
    expect(docked("t-b")).not.toBeNull();
  });

  it("turning off an open note hides its docked preview", () => {
    const tabs: Tab[] = [{ ...baseTabs[0], noteOpen: true }, baseTabs[1]];
    const { noteButton, onUpdateTab } = mount("", tabs);
    const btn = noteButton("t-a")!;
    hover(btn, true);
    expect(docked("t-a")).not.toBeNull();
    act(() => btn.click());
    expect(onUpdateTab).toHaveBeenCalledTimes(1);
    expect(docked("t-a")).toBeNull();
  });

  it("turning the note back on while the pointer stays on the icon shows the docked preview again", () => {
    const on: Tab[] = [{ ...baseTabs[0], noteOpen: true }, baseTabs[1]];
    const { noteButton, rerender } = mount("", on);
    const btn = noteButton("t-a")!;
    hover(btn, true);
    act(() => btn.click());
    rerender([baseTabs[0], baseTabs[1]]);
    expect(docked("t-a")).toBeNull();
    act(() => noteButton("t-a")!.click());
    rerender(on);
    expect(docked("t-a")).not.toBeNull();
    expect(closeButton()).not.toBeNull();
  });

  it("a docked preview of an open note has a close button that hides the note", () => {
    const tabs: Tab[] = [{ ...baseTabs[0], noteOpen: true }, baseTabs[1]];
    const { noteButton, onUpdateTab } = mount("", tabs);
    hover(noteButton("t-a")!, true);
    const close = closeButton() as HTMLButtonElement;
    expect(close).not.toBeNull();
    act(() => close.click());
    expect(onUpdateTab).toHaveBeenCalledTimes(1);
    expect(onUpdateTab.mock.calls[0][0]).toBe("t-a");
    expect(docked("t-a")).toBeNull();
  });
});

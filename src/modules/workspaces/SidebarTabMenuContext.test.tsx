// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSidebarTabMenuActions } from "./SidebarTabMenuContext";
import type { Tab, Workspace } from "./lib/types";

const tabs: Tab[] = [
  { id: "a", kind: "terminal" },
  { id: "b", kind: "terminal", locked: true },
  { id: "c", kind: "terminal" },
];

function setup() {
  const workspacesRef = {
    current: [
      { id: "ws-1", workspaceRoot: "/repo", paneTree: { kind: "pane", id: "p1", tabs, activeTabId: "a" } },
      { id: "ws-2", fsRoot: "/fs", paneTree: { kind: "pane", id: "p2", tabs: [], activeTabId: null } },
      { id: "ws-3", paneTree: { kind: "pane", id: "p3", tabs: [], activeTabId: null } },
    ] as Pick<Workspace, "id" | "paneTree" | "workspaceRoot" | "fsRoot">[],
  };
  const closeTabs = vi.fn();
  const closeTabsRef = { current: closeTabs };
  const tabCallbacksRef = { current: {} as { onRenameTab?: (id: string, t?: string) => void } };
  const saveTabRef = { current: vi.fn() };
  const toggleHibernateRef = { current: vi.fn() };
  const hook = renderHook(() =>
    useSidebarTabMenuActions({ workspacesRef, closeTabsRef, saveTabRef, toggleHibernateRef, tabCallbacksRef }),
  );
  return { hook, workspacesRef, closeTabs, saveTabRef, toggleHibernateRef, tabCallbacksRef };
}

describe("useSidebarTabMenuActions", () => {
  it("saves through the latest save callback", () => {
    const { hook, saveTabRef } = setup();
    hook.result.current.onSaveTab("a");
    expect(saveTabRef.current).toHaveBeenCalledWith("a");
  });

  it("toggles hibernation through the latest callback", () => {
    const { hook, toggleHibernateRef } = setup();
    hook.result.current.onToggleHibernate("a");
    expect(toggleHibernateRef.current).toHaveBeenCalledWith("a");
  });

  it("resolves the root a relative path is measured from: pinned root, then filesystem root", () => {
    const { hook } = setup();
    expect(hook.result.current.workspaceRoot("ws-1")).toBe("/repo");
    expect(hook.result.current.workspaceRoot("ws-2")).toBe("/fs");
    expect(hook.result.current.workspaceRoot("ws-3")).toBeNull();
    expect(hook.result.current.workspaceRoot("nope")).toBeNull();
  });

  it("keeps the same object across renders", () => {
    const { hook } = setup();
    const first = hook.result.current;
    hook.rerender();
    hook.rerender();
    expect(hook.result.current).toBe(first);
  });

  it("reads the latest workspaces and callbacks when an action runs", () => {
    const { hook, workspacesRef, closeTabs, tabCallbacksRef } = setup();
    const actions = hook.result.current;
    expect(actions.paneTabCount("a")).toBe(3);
    workspacesRef.current = [
      { id: "ws-1", paneTree: { kind: "pane", id: "p1", tabs: tabs.slice(0, 2), activeTabId: "a" } },
    ];
    expect(actions.paneTabCount("a")).toBe(2);

    workspacesRef.current = [
      { id: "ws-1", paneTree: { kind: "pane", id: "p1", tabs, activeTabId: "a" } },
    ];
    actions.onCloseOtherTabs("a");
    expect(closeTabs).toHaveBeenLastCalledWith(["c"]);

    const rename = vi.fn();
    tabCallbacksRef.current = { onRenameTab: rename };
    actions.onRenameTab("a", "x");
    expect(rename).toHaveBeenCalledWith("a", "x");
  });

  it("closes nothing when the tab is gone", () => {
    const { hook, closeTabs } = setup();
    hook.result.current.onCloseOtherTabs("nope");
    expect(closeTabs).not.toHaveBeenCalled();
  });
});

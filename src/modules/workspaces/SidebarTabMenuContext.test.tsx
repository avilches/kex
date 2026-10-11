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
      { paneTree: { kind: "pane", id: "p1", tabs, activeTabId: "a" } },
    ] as Pick<Workspace, "paneTree">[],
  };
  const closeTabs = vi.fn();
  const closeTabsRef = { current: closeTabs };
  const tabCallbacksRef = { current: {} as { onRenameTab?: (id: string, t?: string) => void } };
  const saveTabRef = { current: vi.fn() };
  const hook = renderHook(() =>
    useSidebarTabMenuActions({ workspacesRef, closeTabsRef, saveTabRef, tabCallbacksRef }),
  );
  return { hook, workspacesRef, closeTabs, saveTabRef, tabCallbacksRef };
}

describe("useSidebarTabMenuActions", () => {
  it("saves through the latest save callback", () => {
    const { hook, saveTabRef } = setup();
    hook.result.current.onSaveTab("a");
    expect(saveTabRef.current).toHaveBeenCalledWith("a");
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
      { paneTree: { kind: "pane", id: "p1", tabs: tabs.slice(0, 2), activeTabId: "a" } },
    ];
    expect(actions.paneTabCount("a")).toBe(2);

    workspacesRef.current = [{ paneTree: { kind: "pane", id: "p1", tabs, activeTabId: "a" } }];
    actions.onCloseOtherTabs("a");
    expect(closeTabs).toHaveBeenLastCalledWith(["c"]);
    actions.onCloseAllTabs("a");
    expect(closeTabs).toHaveBeenLastCalledWith(["a", "c"]);

    const rename = vi.fn();
    tabCallbacksRef.current = { onRenameTab: rename };
    actions.onRenameTab("a", "x");
    expect(rename).toHaveBeenCalledWith("a", "x");
  });

  it("closes nothing when the tab is gone", () => {
    const { hook, closeTabs } = setup();
    hook.result.current.onCloseAllTabs("nope");
    hook.result.current.onCloseOtherTabs("nope");
    expect(closeTabs).not.toHaveBeenCalled();
  });
});

// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));

import { usePreferencesStore } from "@/modules/settings/preferences";
import { getActionTab, linkActionTab, unlinkActionTab } from "./actionStateStore";
import type { Action } from "./types";
import { useUnlinkRemovedGlobalActions } from "./useUnlinkRemovedGlobalActions";

const script = (id: string): Action => ({ id, name: id, kind: "script", command: `run ${id}`, ownButton: false, cwdMode: "workspace" });

describe("useUnlinkRemovedGlobalActions", () => {
  beforeEach(() => {
    usePreferencesStore.setState({ actions: [script("g1"), script("g2")] });
  });
  afterEach(() => {
    cleanup();
    unlinkActionTab("g1");
    unlinkActionTab("g2");
  });

  it("forgets where a global script ran once the list that comes back no longer has it", () => {
    linkActionTab("g1", "tab-1");
    linkActionTab("g2", "tab-2");
    renderHook(() => useUnlinkRemovedGlobalActions({ current: [] }));
    act(() => usePreferencesStore.setState({ actions: [script("g2")] }));
    expect(getActionTab("g1")).toBeUndefined();
    expect(getActionTab("g2")).toBe("tab-2");
  });

  it("keeps the link of an Action that moved to a workspace with the same id", () => {
    linkActionTab("g1", "tab-1");
    renderHook(() => useUnlinkRemovedGlobalActions({ current: [{ actions: [script("g1")] }] }));
    act(() => usePreferencesStore.setState({ actions: [script("g2")] }));
    expect(getActionTab("g1")).toBe("tab-1");
  });

  it("does nothing for a change that leaves the Actions in place", () => {
    linkActionTab("g1", "tab-1");
    renderHook(() => useUnlinkRemovedGlobalActions({ current: [] }));
    act(() => usePreferencesStore.setState({ actions: [script("g1"), script("g2")] }));
    expect(getActionTab("g1")).toBe("tab-1");
  });

  it("stops listening when unmounted", () => {
    linkActionTab("g1", "tab-1");
    const { unmount } = renderHook(() => useUnlinkRemovedGlobalActions({ current: [] }));
    unmount();
    act(() => usePreferencesStore.setState({ actions: [] }));
    expect(getActionTab("g1")).toBe("tab-1");
  });
});

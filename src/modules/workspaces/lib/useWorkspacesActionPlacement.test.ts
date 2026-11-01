// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Action } from "@/modules/actions";
import { globalActions } from "@/modules/actions/lib/globalActionsBinding";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Workspace } from "./types";
import { useWorkspaces } from "./useWorkspaces";

const control = vi.hoisted(() => ({ write: "ok" as "ok" | "fail" | "hold", release: null as null | (() => void), minted: 0 }));
vi.mock("@/lib/ids", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ids")>();
  return { ...actual, newActionId: () => `minted-${++control.minted}` };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ destroy: vi.fn() }) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));
vi.mock("@/modules/settings/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/settings/store")>();
  return {
    ...actual,
    setGlobalActions: vi.fn(async (list: Action[]) => {
      if (control.write === "fail") throw new Error("disk full");
      if (control.write === "hold") await new Promise<void>((r) => (control.release = r));
      const { usePreferencesStore: store } = await import("@/modules/settings/preferences");
      store.setState({ actions: list });
    }),
  };
});

const act1 = (id: string): Action => ({ id, name: id, kind: "app", command: `open ${id}`, ownButton: false });

const workspace = (actions: Action[]): Workspace => ({
  id: "w1",
  title: "W",
  paneTree: { kind: "pane", id: "p1", tabs: [{ id: "tab-1", kind: "terminal" }], activeTabId: "tab-1" },
  activePaneId: "p1",
  actions,
});

const ids = (list: readonly Action[] | undefined) => (list ?? []).map((a) => a.id);

beforeEach(() => {
  control.write = "ok";
  control.release = null;
  control.minted = 0;
  usePreferencesStore.setState({ actions: [act1("g1"), act1("g2")] });
});

describe("moving an Action between scopes into a place", () => {
  it("a promoted workspace Action lands before the global one it was dropped on", async () => {
    const { result } = renderHook(() => useWorkspaces({ initialWorkspaces: [workspace([act1("a"), act1("b")])] }));
    act(() => result.current.promoteWorkspaceAction("w1", "a", "g2"));
    await waitFor(() => expect(ids(globalActions.get())).toEqual(["g1", "a", "g2"]));
    expect(ids(result.current.workspaces[0]?.actions)).toEqual(["b"]);
  });

  it("goes last without a place", async () => {
    const { result } = renderHook(() => useWorkspaces({ initialWorkspaces: [workspace([act1("a")])] }));
    act(() => result.current.promoteWorkspaceAction("w1", "a"));
    await waitFor(() => expect(ids(globalActions.get())).toEqual(["g1", "g2", "a"]));
  });

  it("a demoted global Action lands before the workspace one it was dropped on", async () => {
    const { result } = renderHook(() => useWorkspaces({ initialWorkspaces: [workspace([act1("a"), act1("b")])] }));
    act(() => result.current.demoteGlobalAction("w1", "g1", "b"));
    await waitFor(() => expect(ids(result.current.workspaces[0]?.actions)).toEqual(["a", "g1", "b"]));
    expect(ids(globalActions.get())).toEqual(["g2"]);
  });
});

describe("moving an Action between scopes without losing it", () => {
  const strict = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);

  it("a demoted Action is already in the workspace while the global write is still going", async () => {
    control.write = "hold";
    const { result } = renderHook(() => useWorkspaces({ initialWorkspaces: [workspace([act1("a")])] }));
    act(() => result.current.demoteGlobalAction("w1", "g1"));
    expect(ids(result.current.workspaces[0]?.actions)).toEqual(["a", "g1"]);
    await waitFor(() => expect(control.release).not.toBeNull());
    await act(async () => {
      control.release?.();
    });
    await waitFor(() => expect(ids(globalActions.get())).toEqual(["g2"]));
  });

  it("a demote whose global write fails leaves both lists as they were", async () => {
    control.write = "fail";
    const { result } = renderHook(() => useWorkspaces({ initialWorkspaces: [workspace([act1("a")])] }));
    act(() => result.current.demoteGlobalAction("w1", "g1"));
    await waitFor(() => expect(ids(result.current.workspaces[0]?.actions)).toEqual(["a"]));
    expect(ids(globalActions.get())).toEqual(["g1", "g2"]);
  });

  it("a window without that workspace ignores the demotion and the Action stays global", async () => {
    const { result } = renderHook(() => useWorkspaces({ initialWorkspaces: [workspace([act1("a")])] }));
    act(() => result.current.demoteGlobalAction("elsewhere", "g1"));
    await act(async () => {});
    expect(ids(globalActions.get())).toEqual(["g1", "g2"]);
    expect(ids(result.current.workspaces[0]?.actions)).toEqual(["a"]);
  });

  it("a promotion whose write fails puts the Action back where it was, not last", async () => {
    control.write = "fail";
    const { result } = renderHook(() => useWorkspaces({ initialWorkspaces: [workspace([act1("a"), act1("b"), act1("c")])] }));
    act(() => result.current.promoteWorkspaceAction("w1", "b"));
    await waitFor(() => expect(ids(result.current.workspaces[0]?.actions)).toEqual(["a", "b", "c"]));
  });

  it("mints the fresh id once, outside the state updater, when the workspace already has that id", async () => {
    const script = (command: string): Action => ({ id: "g1", name: command, kind: "script", command, ownButton: false, cwdMode: "workspace" });
    usePreferencesStore.setState({ actions: [script("make global")] });
    const { result } = renderHook(() => useWorkspaces({ initialWorkspaces: [workspace([script("make local")])] }), { wrapper: strict });
    act(() => result.current.demoteGlobalAction("w1", "g1"));
    await waitFor(() => expect(ids(result.current.workspaces[0]?.actions)).toEqual(["g1", "minted-1"]));
    expect(control.minted).toBe(1);
  });
});

// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Action } from "@/modules/actions";
import { globalActions } from "@/modules/actions/lib/globalActionsBinding";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Workspace } from "./types";
import { useWorkspaces } from "./useWorkspaces";

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ destroy: vi.fn() }) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));
vi.mock("@/modules/settings/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/settings/store")>();
  return {
    ...actual,
    setGlobalActions: vi.fn(async (list: Action[]) => {
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

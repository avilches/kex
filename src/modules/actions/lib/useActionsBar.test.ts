// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetDirGitStore } from "@/modules/workspaces/lib/dirGitStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Workspace } from "@/modules/workspaces/lib/types";
import type { Action } from "./types";
import { useActionsBarModel } from "./useActionsBar";

vi.mock("@/lib/native", () => ({ native: { gitResolveRepo: vi.fn().mockResolvedValue(null) } }));
vi.mock("@/modules/workspace", () => ({
  useWorkspaceEnvStore: (sel: (s: { env: { kind: string } }) => unknown) => sel({ env: { kind: "local" } }),
}));
vi.mock("@/modules/workspaces/lib/systemInfoStore", () => ({
  useSystemInfo: () => ({ home: "/Users/me", host: "MacBook" }),
}));

const agent = (o: Partial<Action>): Action => ({
  id: "w",
  name: "Claude",
  kind: "agent",
  command: "claude",
  cwdMode: "workspace",
  ownButton: true,
  ...o,
});

const ws: Workspace = {
  id: "w1",
  title: "",
  workspaceRoot: "/w",
  cwd: "/w",
  paneTree: { kind: "pane", id: "p1", tabs: [{ id: "tab-1", kind: "terminal", cwd: "/w" }], activeTabId: "tab-1" },
  activePaneId: "p1",
  actions: [agent({ id: "w" }), agent({ id: "c", cwdMode: "context" })],
};

describe("useActionsBarModel twins", () => {
  beforeEach(() => {
    _resetDirGitStore();
    usePreferencesStore.setState({ actions: [] });
  });

  it("hides the twin, and shows everything while showTwins is set", () => {
    const { result, rerender } = renderHook((p: { showTwins?: boolean }) => useActionsBarModel({ workspace: ws, ...p }), {
      initialProps: {},
    });
    expect(result.current.buttons.map((b) => b.id)).toEqual(["w"]);
    rerender({ showTwins: true });
    expect(result.current.buttons.map((b) => b.id)).toEqual(["w", "c"]);
    rerender({ showTwins: false });
    expect(result.current.buttons.map((b) => b.id)).toEqual(["w"]);
  });

  it("keeps the same model while showTwins stays as it was", () => {
    const { result, rerender } = renderHook((p: { showTwins?: boolean }) => useActionsBarModel({ workspace: ws, ...p }), {
      initialProps: { showTwins: true },
    });
    const first = result.current;
    rerender({ showTwins: true });
    expect(result.current).toBe(first);
  });
});

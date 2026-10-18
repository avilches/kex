// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetDirGitStore } from "@/modules/workspaces/lib/dirGitStore";
import { setRunningCommand } from "@/modules/workspaces/lib/terminalEphemeralStore";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { useActionContext } from "./useActionContext";

const resolve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/native", () => ({ native: { gitResolveRepo: resolve } }));
vi.mock("@/modules/workspace", () => ({
  useWorkspaceEnvStore: (sel: (s: { env: { kind: string } }) => unknown) => sel({ env: { kind: "local" } }),
}));
vi.mock("@/modules/workspaces/lib/systemInfoStore", () => ({
  useSystemInfo: () => ({ home: "/Users/me", host: "MacBook" }),
}));

const repo = (branch: string) => ({ repoRoot: "/w", branch, upstream: null, isDetached: false, isWorktree: false });

const ws: Workspace = {
  id: "w1",
  title: "",
  workspaceRoot: "/w",
  cwd: "/w",
  paneTree: { kind: "pane", id: "p1", tabs: [{ id: "tab-1", kind: "terminal", cwd: "/w" }], activeTabId: "tab-1" },
  activePaneId: "p1",
};

describe("useActionContext", () => {
  beforeEach(() => {
    _resetDirGitStore();
    resolve.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("carries every command variable, host included", async () => {
    resolve.mockResolvedValue(repo("main"));
    const { result } = renderHook(() => useActionContext(ws));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(result.current?.vars).toMatchObject({ cwd: "/w", workspace: "/w", branch: "main", repo: "w", host: "MacBook" });
  });

  it("follows a checkout made in the focused terminal", async () => {
    resolve.mockResolvedValueOnce(repo("main")).mockResolvedValue(repo("feat"));
    const { result } = renderHook(() => useActionContext(ws));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(result.current?.vars.branch).toBe("main");
    await act(async () => {
      setRunningCommand("tab-1", "git checkout feat");
      setRunningCommand("tab-1", null);
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current?.vars.branch).toBe("feat");
  });

  it("has no context outside a workspace", () => {
    const { result } = renderHook(() => useActionContext(null));
    expect(result.current).toBeNull();
  });
});

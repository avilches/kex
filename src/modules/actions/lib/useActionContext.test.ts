// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { useActionContext } from "./useActionContext";

vi.mock("@/modules/workspace", () => ({
  useWorkspaceEnvStore: (sel: (s: { env: { kind: string } }) => unknown) => sel({ env: { kind: "local" } }),
}));

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
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("carries {target}, the workspace root, and what the focused tab offers", async () => {
    const { result } = renderHook(() => useActionContext(ws));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(result.current?.vars).toEqual({ target: "/w" });
    expect(result.current?.focus).toEqual({ folder: "/w", file: "" });
    expect(result.current?.folders).toEqual({ workspaceRoot: "/w", workspaceCwd: "/w" });
  });

  it("offers the file of an editor tab and no folder", async () => {
    const onFile: Workspace = {
      ...ws,
      paneTree: { kind: "pane", id: "p1", tabs: [{ id: "tab-2", kind: "editor", path: "/w/src/a.ts", dirty: false, preview: false, title: "" }], activeTabId: "tab-2" },
    };
    const { result } = renderHook(() => useActionContext(onFile));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(result.current?.focus).toEqual({ folder: "", file: "/w/src/a.ts" });
    expect(result.current?.place).toEqual({ folder: false, file: true });
  });

  it("has no context outside a workspace", () => {
    const { result } = renderHook(() => useActionContext(null));
    expect(result.current).toBeNull();
  });
});

// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { ACTIONS_ATTACH_EVENT, ACTIONS_PUSH_EVENT } from "./actionsLink";
import { useWorkspaceActionsBroadcast } from "./actionsBroadcast";

const hoisted = vi.hoisted(() => ({
  handlers: {} as Record<string, () => void>,
  emit: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: hoisted.emit,
  listen: vi.fn((name: string, cb: () => void) => {
    hoisted.handlers[name] = cb;
    return Promise.resolve(() => {});
  }),
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getAllWebviewWindows: () => Promise.resolve([{ label: "settings" }]),
}));

const workspace = (title: string): Workspace => ({
  id: "w1",
  title,
  workspaceRoot: "/p/kex",
  paneTree: { kind: "pane", id: "p1", tabs: [], activeTabId: null },
  activePaneId: "p1",
  actions: [],
});

const mutators = { add: vi.fn(), update: vi.fn(), remove: vi.fn(), reorder: vi.fn(), toGlobal: vi.fn(), toWorkspace: vi.fn() };

async function pushedName(title: string): Promise<string> {
  hoisted.emit.mockClear();
  renderHook(() => useWorkspaceActionsBroadcast({ workspace: workspace(title), mutators }));
  await waitFor(() => expect(hoisted.handlers[ACTIONS_ATTACH_EVENT]).toBeDefined());
  act(() => hoisted.handlers[ACTIONS_ATTACH_EVENT]!());
  await waitFor(() => expect(hoisted.emit.mock.calls.some((c) => c[0] === ACTIONS_PUSH_EVENT)).toBe(true));
  return (hoisted.emit.mock.calls.find((c) => c[0] === ACTIONS_PUSH_EVENT)![1] as { workspaceName: string }).workspaceName;
}

describe("the workspace name pushed to Settings", () => {
  it("has its {templates} expanded, as the Header shows it", async () => {
    expect(await pushedName("Home of {dir}")).toBe("Home of kex");
  });

  it("is the plain title when it has no template", async () => {
    expect(await pushedName("Plain")).toBe("Plain");
  });
});

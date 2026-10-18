// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ destroy: vi.fn() }) }));
vi.mock("./workspaceState", () => ({ claimClose: () => false, flushWorkspaceState: async () => {} }));
vi.mock("@/modules/agents/lib/agentSessionRestore", () => ({
  previewResumeCmd: vi.fn(async () => null),
  seedRestorePlan: vi.fn(),
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: {
    getState: () => ({ autofocusMode: "off", autofocusNewTabs: false, randomWorkspaceColor: false, workspacePaneLimit: 8 }),
  },
}));

import { useWorkspaces } from "./useWorkspaces";
import { allPanes } from "./splitNode";
import type { Tab, Workspace } from "./types";

type Hook = ReturnType<typeof useWorkspaces>;

const term = (id: string): Tab => ({ id, kind: "terminal" });
const makeWs = (id: string, tabs: Tab[], over: Partial<Workspace> = {}): Workspace => ({
  id,
  title: "",
  paneTree: { kind: "pane", id: `p-${id}`, tabs, activeTabId: tabs[0]?.id ?? null },
  activePaneId: `p-${id}`,
  ...over,
});
const tabIds = (ws: Workspace | undefined) => allPanes(ws!.paneTree).flatMap((p) => p.tabs.map((t) => t.id));

function mount(initialWorkspaces: Workspace[]) {
  const container = document.createElement("div");
  const root = createRoot(container);
  let latest: Hook | undefined;
  function Harness() {
    latest = useWorkspaces({ initialWorkspaces });
    return null;
  }
  act(() => root.render(createElement(Harness)));
  return {
    get h(): Hook {
      return latest!;
    },
    unmount: () => act(() => root.unmount()),
  };
}

describe("undo close workspace", () => {
  let view: ReturnType<typeof mount> | undefined;
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => view?.unmount());

  it("brings back a workspace that folded away with its last tab, in its position and selected", async () => {
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [term("b1")]), makeWs("c", [term("c1")])]);
    act(() => view!.h.setActiveWorkspaceId("b"));

    act(() => view!.h.closeTab("b", "b1"));
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a", "c"]);

    await act(async () => {
      await view!.h.reopenClosed();
    });

    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a", "b", "c"]);
    expect(view.h.activeWorkspaceId).toBe("b");
    const restored = view.h.workspaces[1];
    expect(tabIds(restored)).toHaveLength(1);
    expect(tabIds(restored)[0]).not.toBe("b1");
  });

  it("restores everything the workspace held after an explicit close", async () => {
    const rich = makeWs("b", [term("b1"), term("b2")], {
      title: "Backend",
      color: "#ff0000",
      icon: "rocket",
      groupId: "g1",
      actions: [{ id: "ac-1", name: "dev", runInTerminal: true, command: "pnpm dev", ownButton: false }],
    });
    view = mount([makeWs("a", [term("a1")]), rich]);

    act(() => view!.h.closeWorkspace("b"));
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a"]);

    await act(async () => {
      await view!.h.reopenClosed();
    });

    const restored = view.h.workspaces[1]!;
    expect(restored).toMatchObject({ id: "b", title: "Backend", color: "#ff0000", icon: "rocket", groupId: "g1" });
    expect(tabIds(restored)).toHaveLength(2);
    expect(restored.actions?.map((a) => a.id)).toEqual(["ac-1"]);
  });

  it("returns tabs closed earlier into the restored workspace on later undos", async () => {
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [term("b1"), term("b2")])]);

    act(() => view!.h.closeTab("b", "b2"));
    act(() => view!.h.closeTab("b", "b1"));
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a"]);

    await act(async () => {
      await view!.h.reopenClosed();
    });
    expect(tabIds(view.h.workspaces[1])).toHaveLength(1);

    await act(async () => {
      await view!.h.reopenClosed();
    });
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a", "b"]);
    expect(tabIds(view.h.workspaces[1])).toHaveLength(2);
  });

  it("does not offer a workspace that is already open again", async () => {
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [term("b1")])]);
    act(() => view!.h.closeWorkspace("b"));
    await act(async () => {
      await view!.h.reopenClosed();
    });
    await act(async () => {
      await view!.h.reopenClosed();
    });
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("restores a hibernated workspace still hibernated, keeping its terminal ids", async () => {
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [term("b1")], { hibernated: true })]);
    act(() => view!.h.closeWorkspace("b"));
    await act(async () => {
      await view!.h.reopenClosed();
    });
    const restored = view.h.workspaces[1]!;
    expect(restored.hibernated).toBe(true);
    expect(tabIds(restored)).toEqual(["b1"]);
  });
});

// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dragging: null as object | null,
  droppable: { id: "", disabled: true },
  isOver: false,
}));

vi.mock("@dnd-kit/core", () => ({
  useDroppable: (args: { id: string; disabled: boolean }) => {
    state.droppable = args;
    return { setNodeRef: () => {}, isOver: state.isOver };
  },
}));
vi.mock("./WorkspaceDndProvider", () => ({
  useWorkspaceDnd: () => ({ draggingItem: state.dragging }),
}));

const sessionRestore = vi.hoisted(() => ({
  previewResumeCmd: vi.fn(
    async (
      _tabId: string,
    ): Promise<{ agent: string | null; resumeCmd: string } | null> => null,
  ),
  sessionPreviews: vi.fn(
    async (
      _tabIds: string[],
    ): Promise<
      { tabId: string; cwd: string; lastMessage?: string | null; updatedAt: number }[]
    > => [],
  ),
}));

vi.mock("@/modules/agents/lib/agentSessionRestore", () => ({
  previewResumeCmd: sessionRestore.previewResumeCmd,
  sessionPreviews: sessionRestore.sessionPreviews,
}));
vi.mock("@/lib/homeDir", () => ({ cachedHomeDir: () => "/Users/me" }));

import { HibernatedOverlay } from "./HibernatedOverlay";
import type { Workspace } from "./lib/types";

const tab = { id: "t1", kind: "terminal", title: "build" };
const workspaceB = {
  id: "B",
  title: "Beta",
  hibernated: true,
  paneTree: { kind: "pane", id: "p", tabs: [tab], activeTabId: "t1" },
} as unknown as Workspace;

const tabFrom = (workspaceId: string) => ({
  kind: "tab",
  tab: { id: "t1", kind: "terminal" },
  workspaceId,
  prevTabId: null,
});

function mount(active = true) {
  return render(
    <HibernatedOverlay
      workspace={workspaceB}
      active={active}
      onWake={() => {}}
    />,
  );
}

describe("HibernatedOverlay drop zone", () => {
  beforeEach(() => {
    state.dragging = null;
    state.isOver = false;
  });
  afterEach(cleanup);

  it("is a droppable keyed by its workspace, disabled without a drag", () => {
    mount();
    expect(state.droppable).toEqual({ id: "hibernated:B", disabled: true });
  });

  it("accepts a tab dragged from another workspace", () => {
    state.dragging = tabFrom("A");
    mount();
    expect(state.droppable.disabled).toBe(false);
  });

  it("rejects files, its own tabs and an inactive workspace", () => {
    state.dragging = { kind: "file", path: "/x", isDir: false };
    mount();
    expect(state.droppable.disabled).toBe(true);
    cleanup();
    state.dragging = tabFrom("B");
    mount();
    expect(state.droppable.disabled).toBe(true);
    cleanup();
    state.dragging = tabFrom("A");
    mount(false);
    expect(state.droppable.disabled).toBe(true);
  });

  it("lists the workspace tabs", () => {
    const { getByText } = mount();
    expect(getByText("build")).toBeTruthy();
  });

  it("highlights only while a valid drag is over it", () => {
    state.dragging = tabFrom("A");
    state.isOver = true;
    const { container } = mount();
    expect(container.firstElementChild?.className).toContain("ring-2");
  });
});

describe("HibernatedOverlay sleeping snapshot", () => {
  beforeEach(() => {
    state.dragging = null;
    state.isOver = false;
    sessionRestore.previewResumeCmd.mockReset();
    sessionRestore.previewResumeCmd.mockResolvedValue({
      agent: "claude",
      resumeCmd: "claude --resume",
    });
  });
  afterEach(cleanup);

  const sleeping = (over: Record<string, unknown> = {}) =>
    ({
      id: "B",
      title: "Beta",
      hibernated: true,
      hibernatedAt: 0,
      paneTree: { kind: "pane", id: "p", tabs: [tab], activeTabId: "t1" },
      ...over,
    }) as unknown as Workspace;
  const awakeLookup = { agent: "claude", command: "claude --resume" } as const;

  it("queries the resume plan once and not on every fresh tab object", async () => {
    const first = render(
      <HibernatedOverlay workspace={sleeping()} active onWake={() => {}} />,
    );
    expect(sessionRestore.previewResumeCmd).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(first.getByText("claude --resume")).toBeTruthy(),
    );
    first.rerender(
      <HibernatedOverlay
        workspace={sleeping({ title: "Beta v2" })}
        active
        onWake={() => {}}
      />,
    );
    first.rerender(
      <HibernatedOverlay
        workspace={sleeping({
          paneTree: {
            kind: "pane",
            id: "p",
            tabs: [{ ...tab, title: "renamed" }],
            activeTabId: "t1",
          },
        })}
        active
        onWake={() => {}}
      />,
    );
    expect(sessionRestore.previewResumeCmd).toHaveBeenCalledTimes(1);
  });

  it("queries again when the tab id changes", () => {
    const before = sessionRestore.previewResumeCmd.mock.calls.length;
    render(
      <HibernatedOverlay workspace={sleeping()} active onWake={() => {}} />,
    );
    render(
      <HibernatedOverlay
        workspace={sleeping({
          paneTree: {
            kind: "pane",
            id: "p",
            tabs: [{ ...tab, id: "t2" }],
            activeTabId: "t2",
          },
        })}
        active
        onWake={() => {}}
      />,
    );
    expect(
      sessionRestore.previewResumeCmd.mock.calls.slice(before).map((c) => c[0]),
    ).toEqual(["t1", "t2"]);
  });

  it("reads the persisted hibernation without asking the backend", () => {
    const persisted = {
      id: "B",
      title: "Beta",
      hibernated: true,
      paneTree: {
        kind: "pane",
        id: "p",
        tabs: [{ ...tab, hibernation: awakeLookup }],
        activeTabId: "t1",
      },
    } as unknown as Workspace;
    render(
      <HibernatedOverlay workspace={persisted} active onWake={() => {}} />,
    );
    expect(sessionRestore.previewResumeCmd).not.toHaveBeenCalled();
  });
});

describe("HibernatedOverlay session previews", () => {
  beforeEach(() => {
    state.dragging = null;
    state.isOver = false;
    sessionRestore.previewResumeCmd.mockReset();
    sessionRestore.previewResumeCmd.mockResolvedValue(null);
    sessionRestore.sessionPreviews.mockReset();
  });
  afterEach(cleanup);

  it("shows the last assistant message with the folder and the time", async () => {
    sessionRestore.sessionPreviews.mockResolvedValue([
      {
        tabId: "t1",
        cwd: "/Users/me/code/kex",
        lastMessage: "All tests pass.",
        updatedAt: Math.floor(Date.now() / 1000) - 2 * 3600,
      },
    ]);
    const view = mount();
    await vi.waitFor(() => expect(view.getByText("All tests pass.")).toBeTruthy());
    expect(view.getByText("~/code/kex \u00b7 2h ago")).toBeTruthy();
    expect(sessionRestore.sessionPreviews).toHaveBeenCalledWith(["t1"]);
  });

  it("shows only the folder and time when the agent sent no message", async () => {
    sessionRestore.sessionPreviews.mockResolvedValue([
      { tabId: "t1", cwd: "/tmp/p", updatedAt: Math.floor(Date.now() / 1000) },
    ]);
    const view = mount();
    await vi.waitFor(() =>
      expect(view.getByText("/tmp/p \u00b7 less than a minute ago")).toBeTruthy(),
    );
    expect(view.container.querySelector(".line-clamp-2")).toBeNull();
  });

  it("does not read the store while the overlay is not the active workspace", () => {
    mount(false);
    expect(sessionRestore.sessionPreviews).not.toHaveBeenCalled();
  });

  it("asks once for the same tabs across re-renders", async () => {
    sessionRestore.sessionPreviews.mockResolvedValue([]);
    const view = mount();
    view.rerender(
      <HibernatedOverlay workspace={{ ...workspaceB, title: "Beta v2" }} active onWake={() => {}} />,
    );
    await vi.waitFor(() => expect(sessionRestore.sessionPreviews).toHaveBeenCalledTimes(1));
  });
});

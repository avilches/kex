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

import { HibernatedOverlay } from "./HibernatedOverlay";

const tabFrom = (workspaceId: string) => ({ kind: "tab", tab: { id: "t1", kind: "terminal" }, workspaceId });

function mount(active = true) {
  return render(<HibernatedOverlay workspaceId="B" active={active} onWake={() => {}} />);
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

  it("highlights only while a valid drag is over it", () => {
    state.dragging = tabFrom("A");
    state.isOver = true;
    const { container } = mount();
    expect(container.firstElementChild?.className).toContain("ring-2");
  });
});

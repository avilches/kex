// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "./lib/types";
import { useWorkspaceMove, WorkspaceMoveProvider, type WorkspaceMoveTarget } from "./WorkspaceMoveContext";

const ws = (over: Partial<Workspace>): Workspace => ({
  id: "w1",
  title: "Kex",
  paneTree: { kind: "pane", id: "p1", tabs: [], activeTabId: null },
  activePaneId: "p1",
  ...over,
});

function targetsOf(workspaces: Workspace[]): WorkspaceMoveTarget[] {
  let seen: WorkspaceMoveTarget[] = [];
  function Probe() {
    seen = useWorkspaceMove().targets;
    return null;
  }
  render(
    <WorkspaceMoveProvider workspaces={workspaces} onMoveTab={vi.fn()}>
      <Probe />
    </WorkspaceMoveProvider>,
  );
  return seen;
}

describe("WorkspaceMoveProvider", () => {
  afterEach(cleanup);

  it("lists workspaces that share a title, each under its own id", () => {
    const targets = targetsOf([ws({ id: "a" }), ws({ id: "b" })]);
    expect(targets.map((t) => [t.id, t.title])).toEqual([["a", "Kex"], ["b", "Kex"]]);
  });

  it("lists hibernated workspaces flagged, with their icon", () => {
    const targets = targetsOf([ws({ id: "a", icon: "rocket", hibernated: true }), ws({ id: "b" })]);
    expect(targets[0]).toMatchObject({ id: "a", icon: "rocket", hibernated: true });
    expect(targets[1]).toMatchObject({ id: "b", hibernated: false });
  });
});

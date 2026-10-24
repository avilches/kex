import { describe, expect, it } from "vitest";
import type { Action } from "@/modules/actions";
import { actionsToDelete, type ExplorerRootMode, type Workspace } from "./types";

describe("ExplorerRootMode", () => {
  it("only allows workspace or filesystem", () => {
    const modes: ExplorerRootMode[] = ["workspace", "filesystem"];
    expect(modes).toHaveLength(2);
  });
});

describe("actionsToDelete", () => {
  const base: Workspace = {
    id: "w1",
    title: "",
    paneTree: { kind: "pane", id: "p1", tabs: [], activeTabId: null },
    activePaneId: "p1",
  };
  const action = (command: string): Action => ({ id: "ac-1", name: "A", kind: "app", command, ownButton: false });

  it("counts the Actions that have a command", () => {
    const ws = { ...base, actions: [action("code {cwd}"), action("pnpm dev")] };
    expect(actionsToDelete(ws)).toBe(2);
  });

  it("ignores blank commands", () => {
    expect(actionsToDelete({ ...base, actions: [action("  ")] })).toBe(0);
  });

  it("is zero for a workspace without Actions", () => {
    expect(actionsToDelete(base)).toBe(0);
  });
});

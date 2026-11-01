import { describe, expect, it } from "vitest";
import { buildActionsBarModel } from "./actionsBar";
import type { Action } from "./types";

// A workspace with no root, and a terminal focused in a real folder. The submenu acts on that
// folder, so nothing in it needs the root.
const rootless = {
  vars: { target: "" },
  shell: "posix" as const,
  focus: { folder: "/somewhere/src", file: "/somewhere/src/a.ts" },
  folders: { workspaceRoot: null, workspaceCwd: null },
};

const agent: Action = { id: "g", name: "Claude", kind: "agent", command: "claude", ownButton: false };
const app: Action = { id: "a", name: "Zed", kind: "app", command: "zed {target}", accepts: "both", ownButton: false };
const folderScript: Action = { id: "s", name: "Make", kind: "script", command: "make", runs: "folder", ownButton: false };
const fileScript: Action = { id: "f", name: "Count", kind: "script", command: "wc -l {target}", runs: "file", ownButton: false };

describe("the submenu of a workspace with no root", () => {
  const onFolder = buildActionsBarModel({ local: [agent, app, folderScript], context: rootless, states: new Map(), place: { folder: true, file: false } });
  const onFile = buildActionsBarModel({ local: [app, fileScript], context: rootless, states: new Map(), place: { folder: false, file: true } });

  it("is not greyed by the missing root: it acts on the focused folder", () => {
    for (const item of onFolder.contextCombo.workspace) {
      expect(item.disabledReason, item.id).toBeNull();
      expect(item.needsRoot, item.id).toBe(false);
    }
    expect(onFolder.contextCombo.workspace.map((i) => i.id)).toEqual(["g", "s", "a"]);
  });

  it("is not greyed on a focused file either", () => {
    for (const item of onFile.contextCombo.workspace) expect(item.disabledReason, item.id).toBeNull();
  });

  it("still greys the same Actions in the Header, which does act on the root", () => {
    const header = [...onFolder.buttons, ...onFolder.menu.workspace];
    for (const id of ["g", "a", "s"]) expect(header.find((i) => i.id === id)?.needsRoot, id).toBe(true);
  });
});

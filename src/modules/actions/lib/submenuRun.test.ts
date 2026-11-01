import { describe, expect, it } from "vitest";
import { planActionRun, type RunContext } from "./actionRun";
import { buildActionsBarModel } from "./actionsBar";
import { runOverlayFor } from "./runOverlay";
import type { Action } from "./types";

const agent: Action = { id: "g", name: "Claude", kind: "agent", command: "claude", ownButton: false };
const folderScript: Action = { id: "s", name: "Make", kind: "script", command: "make -C {target}", runs: "folder", ownButton: false };
const fileScript: Action = { id: "f", name: "Count", kind: "script", command: "wc -l {target}", runs: "file", ownButton: false };

const ctx = {
  vars: { target: "/w" },
  shell: "posix" as const,
  focus: { folder: "/w/src", file: "/w/src/a b.ts" },
  folders: { workspaceRoot: "/w", workspaceCwd: "/w" },
};

const runCtx = (over: Partial<RunContext>): RunContext => ({
  shell: "posix",
  vars: { target: "/w" },
  folders: { workspaceRoot: "/w", workspaceCwd: "/w" },
  link: null,
  scriptPaneExists: true,
  atPaneLimit: false,
  ...over,
});

// What a click on a submenu entry sends to the runner: its runTarget through runOverlayFor.
const clickOverlay = (target: string, kind: "file" | "folder") => runOverlayFor(target, kind);

describe("running from the focused-tab submenu", () => {
  const onFolder = buildActionsBarModel({ local: [agent, folderScript], context: ctx, states: new Map(), place: { folder: true, file: false } });
  const onFile = buildActionsBarModel({ local: [fileScript], context: ctx, states: new Map(), place: { folder: false, file: true } });

  it("starts an agent in the focused folder, not in the root", () => {
    const item = onFolder.contextCombo.workspace.find((i) => i.id === "g")!;
    const overlay = clickOverlay(item.runTarget!, item.runTargetKind!);
    const plan = planActionRun(agent, runCtx({ vars: { target: item.runTarget! }, startFolder: overlay.spawnCwd }));
    expect(plan).toMatchObject({ kind: "new-agent-tab", cwd: "/w/src" });
  });

  it("runs a folder script on the focused folder from that folder", () => {
    const item = onFolder.contextCombo.workspace.find((i) => i.id === "s")!;
    const overlay = clickOverlay(item.runTarget!, item.runTargetKind!);
    const plan = planActionRun(folderScript, runCtx({ vars: { ...overlay.vars! }, startFolder: overlay.spawnCwd }));
    expect(plan).toMatchObject({ kind: "new-tab", cwd: "/w/src" });
    expect(plan.kind === "new-tab" && plan.input).toBe("make -C '/w/src'\r");
  });

  it("runs a file script on the focused file from the folder that holds it, quoting a name with spaces", () => {
    const item = onFile.contextCombo.workspace.find((i) => i.id === "f")!;
    const overlay = clickOverlay(item.runTarget!, item.runTargetKind!);
    const plan = planActionRun(fileScript, runCtx({ vars: { ...overlay.vars! }, startFolder: overlay.spawnCwd }));
    expect(plan).toMatchObject({ kind: "new-tab", cwd: "/w/src" });
    expect(plan.kind === "new-tab" && plan.input).toBe("wc -l '/w/src/a b.ts'\r");
  });

  it("runs the same folder script from the Header on the workspace root", () => {
    const plan = planActionRun(folderScript, runCtx({}));
    expect(plan).toMatchObject({ kind: "new-tab", cwd: "/w" });
    expect(plan.kind === "new-tab" && plan.input).toBe("make -C '/w'\r");
  });
});

import { describe, expect, it } from "vitest";
import { inHeader, offeredAt, takes } from "./actionTargets";
import type { Action } from "./types";

const base = { id: "x", name: "X", command: "cmd", ownButton: false };
const agent: Action = { ...base, kind: "agent" };
const app = (accepts?: "file" | "folder" | "both"): Action => ({ ...base, kind: "app", command: "zed {target}", ...(accepts ? { accepts } : {}) });
const script = (runs: "folder" | "file" | "workspace" | "fixed"): Action => ({
  ...base,
  kind: "script",
  runs,
  ...(runs === "fixed" ? { cwd: "/srv" } : {}),
  ...(runs === "file" ? { command: "wc {target}" } : {}),
});

// The matrix of "What is shown where" in the design: one row per Action, the Header and then
// the two kinds of place a menu or the focused-tab submenu can be on.
const MATRIX: [string, Action, { header: boolean; folder: boolean; file: boolean }][] = [
  ["agent", agent, { header: true, folder: true, file: false }],
  ["app, folders", app("folder"), { header: true, folder: true, file: false }],
  ["app, files", app("file"), { header: false, folder: false, file: true }],
  ["app, both", app("both"), { header: true, folder: true, file: true }],
  ["app, never said", app(), { header: true, folder: true, file: false }],
  ["script, any folder", script("folder"), { header: true, folder: true, file: false }],
  ["script, any file", script("file"), { header: false, folder: false, file: true }],
  ["script, workspace root only", script("workspace"), { header: true, folder: false, file: false }],
  ["script, one fixed folder", script("fixed"), { header: true, folder: false, file: false }],
];

describe("where an Action is offered", () => {
  it.each(MATRIX)("%s", (_name, action, want) => {
    expect(inHeader(action)).toBe(want.header);
    expect(offeredAt(action, "folder")).toBe(want.folder);
    expect(offeredAt(action, "file")).toBe(want.file);
  });

  it("never offers an agent on a file, nor a script that always runs in one place on any row", () => {
    expect(offeredAt(agent, "file")).toBe(false);
    for (const runs of ["workspace", "fixed"] as const) {
      expect(offeredAt(script(runs), "folder")).toBe(false);
      expect(offeredAt(script(runs), "file")).toBe(false);
    }
  });

  it("agrees with takes: a menu offers exactly what an Action acts on", () => {
    for (const [, action] of MATRIX) {
      expect(offeredAt(action, "folder")).toBe(takes(action).folder);
      expect(offeredAt(action, "file")).toBe(takes(action).file);
    }
  });
});

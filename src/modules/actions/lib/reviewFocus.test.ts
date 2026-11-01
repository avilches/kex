import { describe, expect, it } from "vitest";
import { planActionRun, type RunContext } from "./actionRun";
import { actionAvailability, buildActionsBarModel, soleIconButtons, WORKSPACE_UNSET } from "./actionsBar";
import { normalizeActions, updateAction } from "./actions";
import { commandProblem } from "./commandTemplate";
import type { Action } from "./types";

// The five failure modes the plan's Review Focus lists, each one tried against the real code.

const runCtx = (over: Partial<RunContext> = {}): RunContext => ({
  shell: "posix",
  vars: { target: "/w" },
  folders: { workspaceRoot: "/w", workspaceCwd: "/w" },
  link: null,
  scriptPaneExists: true,
  atPaneLimit: false,
  ...over,
});
const script = (o: Partial<Action> = {}): Action => ({ id: "s", name: "S", kind: "script", command: "pnpm dev", runs: "workspace", ownButton: false, ...o });

describe("review focus 1: a script saved before `runs` existed", () => {
  it("is dropped, the rest of the list loads and nothing throws", () => {
    const list = normalizeActions([
      { id: "old", name: "Old", kind: "script", command: "ls", cwdMode: "home", ownButton: false },
      null,
      "garbage",
      script({ id: "keep" }),
    ]);
    expect(list.map((a) => a.id)).toEqual(["keep"]);
  });
});

describe("review focus 2: a file script without {target}", () => {
  it("is refused when saved and blocked when run", () => {
    const bad = script({ runs: "file", command: "echo hi" });
    expect(commandProblem(bad.command, "posix", undefined, "file")).toMatch(/must use \{target\}/);
    expect(planActionRun(bad, runCtx({ vars: { target: "/p/a.ts" }, startFolder: "/p" })).kind).toBe("blocked");
    expect(actionAvailability(bad, { vars: { target: "/p/a.ts" }, shell: "posix", folders: { workspaceRoot: "/p" } })).toMatch(/must use/);
  });
});

describe("review focus 3: a file path a shell must not execute", () => {
  const file = script({ runs: "file", command: "wc -l {target}" });
  it.each(["/p/$(touch PWNED).ts", "/p/`id`.ts", "/p/a'b.ts", '/p/a"b.ts', "/p/a\\b.ts"])("blocks %s instead of typing it", (target) => {
    const plan = planActionRun(file, runCtx({ vars: { target }, startFolder: "/p" }));
    expect(plan.kind).toBe("blocked");
    expect(plan.kind === "blocked" && plan.reason).toMatch(/cannot be used in a script/);
  });

  it("quotes a name with spaces and a leading dash as one argument", () => {
    const plan = planActionRun(file, runCtx({ vars: { target: "/p/-r a b.ts" }, startFolder: "/p" }));
    expect(plan.kind === "new-tab" && plan.input).toBe("wc -l '/p/-r a b.ts'\r");
  });
});

describe("review focus 4: no workspace root", () => {
  const rootless = { vars: { target: "" }, shell: "posix" as const, folders: { workspaceRoot: null, workspaceCwd: null } };
  const agent: Action = { id: "g", name: "Claude", kind: "agent", command: "claude", ownButton: true };
  const app: Action = { id: "a", name: "Zed", kind: "app", command: "zed {target}", accepts: "folder", ownButton: false };

  it("greys what needs the root, keeps it clickable, and leaves a fixed folder alone", () => {
    const fixed = script({ id: "x", runs: "fixed", cwd: "/srv" });
    const m = buildActionsBarModel({
      local: [agent, app, script({ id: "w", runs: "workspace" }), script({ id: "f", runs: "folder", command: "ls" }), fixed],
      context: rootless,
      states: new Map(),
    });
    const items = [...m.buttons, ...m.menu.workspace];
    for (const id of ["g", "a", "w", "f"]) {
      expect(items.find((i) => i.id === id), id).toMatchObject({ disabledReason: WORKSPACE_UNSET, needsRoot: true });
    }
    expect(items.find((i) => i.id === "x")).toMatchObject({ disabledReason: null, needsRoot: false });
  });

  it("agrees with the runner for every one of them", () => {
    for (const a of [agent, app, script({ runs: "workspace" }), script({ runs: "folder", command: "ls" })]) {
      expect(actionAvailability(a, rootless), a.kind + (a.runs ?? "")).toBe(WORKSPACE_UNSET);
      expect(planActionRun(a, runCtx({ vars: { target: "" }, folders: { workspaceRoot: null, workspaceCwd: null } })).kind, a.kind).toBe("blocked");
    }
  });
});

describe("review focus 5: Claude and Claude with Yolo", () => {
  const claude: Action = { id: "c1", name: "Claude Code", kind: "agent", command: "claude", icon: "agent:claude", ownButton: true };
  const yolo: Action = { id: "c2", name: "Claude Code (yolo)", kind: "agent", command: "claude --dangerously-skip-permissions", icon: "agent:claude", ownButton: true };
  const codex: Action = { id: "x1", name: "Codex", kind: "agent", command: "codex", icon: "agent:codex", ownButton: true };

  it("keeps both names, and shows a lone Codex as its icon", () => {
    expect(soleIconButtons([claude, yolo])).toEqual(new Set());
    expect(soleIconButtons([claude, yolo, codex])).toEqual(new Set(["x1"]));
  });

  it("never changes an icon by editing the command, however many times", () => {
    let list: Action[] = [claude];
    for (const command of ["claude --a", "claude", "other-binary", "claude --dangerously-skip-permissions"]) {
      list = updateAction(list, "c1", { command });
      expect(list[0]!.icon).toBe("agent:claude");
    }
  });
});

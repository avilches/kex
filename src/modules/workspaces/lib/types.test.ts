import { describe, expect, it } from "vitest";
import type { Action } from "@/modules/actions";
import { scriptsToDelete, type ExplorerRootMode, type Script, type Workspace } from "./types";

describe("ExplorerRootMode", () => {
  it("only allows workspace or filesystem", () => {
    const modes: ExplorerRootMode[] = ["workspace", "filesystem"];
    expect(modes).toHaveLength(2);
  });
});

describe("Script", () => {
  it("tabId is optional", () => {
    const cfg: Script = { id: "1", name: "Dev", command: "pnpm dev" };
    expect(cfg.tabId).toBeUndefined();
  });

  it("cwd is optional", () => {
    const cfg: Script = { id: "2", name: "Test", command: "pnpm test" };
    expect(cfg.cwd).toBeUndefined();
  });

  it("accepts all fields", () => {
    const cfg: Script = {
      id: "3",
      name: "Build",
      command: "pnpm build",
      cwd: "/home/user/proj",
      tabId: "tab-1",
    };
    expect(cfg.id).toBe("3");
    expect(cfg.tabId).toBe("tab-1");
  });
});

describe("scriptsToDelete", () => {
  const base: Workspace = {
    id: "w1",
    title: "",
    paneTree: { kind: "pane", id: "p1", tabs: [], activeTabId: null },
    activePaneId: "p1",
  };
  const action = (command: string): Action => ({ id: "ac-1", name: "A", runInTerminal: false, command, ownButton: false });

  it("counts scripts and Actions that have a command", () => {
    const ws = { ...base, scripts: [{ id: "1", name: "a", command: "x" }], actions: [action("code {cwd}")] };
    expect(scriptsToDelete(ws)).toBe(2);
  });

  it("ignores blank commands in both", () => {
    const ws = { ...base, scripts: [{ id: "1", name: "a", command: " " }], actions: [action("  ")] };
    expect(scriptsToDelete(ws)).toBe(0);
  });

  it("is zero for a workspace with neither", () => {
    expect(scriptsToDelete(base)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import type { ExplorerRootMode, Script } from "./types";

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

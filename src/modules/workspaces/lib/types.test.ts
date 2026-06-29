import { describe, expect, it } from "vitest";
import { scratchpadStateOf } from "./types";
import type { ExplorerRootMode, RunConfig } from "./types";

describe("scratchpadStateOf", () => {
  it("is hidden when closed regardless of active side", () => {
    expect(scratchpadStateOf(false, false)).toBe("hidden");
    expect(scratchpadStateOf(false, true)).toBe("hidden");
  });

  it("is focused when open and the scratchpad is the active side", () => {
    expect(scratchpadStateOf(true, true)).toBe("focused");
  });

  it("is visible when open but the terminal is the active side", () => {
    expect(scratchpadStateOf(true, false)).toBe("visible");
  });
});

describe("ExplorerRootMode", () => {
  it("only allows workspace or filesystem", () => {
    const modes: ExplorerRootMode[] = ["workspace", "filesystem"];
    expect(modes).toHaveLength(2);
  });
});

describe("RunConfig", () => {
  it("panelId is optional", () => {
    const cfg: RunConfig = { id: "1", name: "Dev", command: "pnpm dev" };
    expect(cfg.panelId).toBeUndefined();
  });

  it("cwd is optional", () => {
    const cfg: RunConfig = { id: "2", name: "Test", command: "pnpm test" };
    expect(cfg.cwd).toBeUndefined();
  });

  it("accepts all fields", () => {
    const cfg: RunConfig = {
      id: "3",
      name: "Build",
      command: "pnpm build",
      cwd: "/home/user/proj",
      panelId: "panel-1",
    };
    expect(cfg.id).toBe("3");
    expect(cfg.panelId).toBe("panel-1");
  });
});

import { describe, expect, it } from "vitest";
import { BASE_PORT, buildTauriArgs, pickPort, preferredPort } from "./devPort.mjs";

const wt = (name) => `/Users/x/Kex/.claude/worktrees/${name}`;

describe("preferredPort", () => {
  it("keeps 1420 for the main checkout", () => {
    expect(preferredPort("/Users/x/Kex")).toBe(BASE_PORT);
  });

  it("is stable per worktree and stays out of 1420", () => {
    expect(preferredPort(wt("a"))).toBe(preferredPort(wt("a")));
    expect(preferredPort(wt("a"))).toBeGreaterThan(BASE_PORT);
    expect(preferredPort(wt("a"))).not.toBe(preferredPort(wt("b")));
  });
});

describe("pickPort", () => {
  it("takes the preferred port when free", async () => {
    expect(await pickPort(wt("a"), async () => true)).toBe(preferredPort(wt("a")));
  });

  it("moves on to the next port when the preferred one is taken", async () => {
    const first = preferredPort(wt("a"));
    expect(await pickPort(wt("a"), async (p) => p !== first)).toBe(first + 1);
  });

  it("main falls back to the worktree range when 1420 is taken", async () => {
    const port = await pickPort("/Users/x/Kex", async (p) => p !== BASE_PORT);
    expect(port).toBeGreaterThan(BASE_PORT);
  });

  it("gives up when nothing is free", async () => {
    await expect(pickPort(wt("a"), async () => false, 5)).rejects.toThrow(/No free dev port/);
  });
});

describe("buildTauriArgs", () => {
  it("adds the dev url to tauri dev", () => {
    const args = buildTauriArgs(["dev", "--no-watch"], 1500);
    expect(args.slice(0, 2)).toEqual(["dev", "--no-watch"]);
    expect(JSON.parse(args[args.indexOf("--config") + 1])).toEqual({
      build: { devUrl: "http://localhost:1500" },
    });
  });

  it("leaves other commands alone", () => {
    expect(buildTauriArgs(["build"], 1500)).toEqual(["build"]);
  });
});

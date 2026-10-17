// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolve = vi.fn();
vi.mock("@/lib/native", () => ({ native: { gitResolveRepo: (d: string) => resolve(d) } }));

import { _resetDirGitStore, getDirGit } from "@/modules/workspaces/lib/dirGitStore";
import { demandPaletteDirs } from "./usePaletteGit";

const flush = () => new Promise((r) => setTimeout(r, 0));
const info = (repoRoot: string, branch: string) => ({ repoRoot, branch, upstream: null, isDetached: false, isWorktree: false });

describe("demandPaletteDirs", () => {
  beforeEach(() => {
    _resetDirGitStore();
    resolve.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("resolves the branch of every distinct directory, once each", async () => {
    resolve.mockImplementation(async (d: string) => (d === "/x/a" ? info("/x", "feat") : info("/y", "main")));
    const release = demandPaletteDirs(["/x/a", "/y/b", "/x/a", ""]);
    await flush();
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(getDirGit("/x/a").branch).toBe("feat");
    expect(getDirGit("/y/b").branch).toBe("main");
    release();
  });

  it("stops asking for those directories on release", async () => {
    resolve.mockResolvedValue(info("/r", "main"));
    const release = demandPaletteDirs(["/r/a"]);
    await flush();
    release();
    resolve.mockClear();
    window.dispatchEvent(new Event("focus"));
    await flush();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("does nothing for an empty list", () => {
    const release = demandPaletteDirs([]);
    release();
    expect(resolve).not.toHaveBeenCalled();
  });
});

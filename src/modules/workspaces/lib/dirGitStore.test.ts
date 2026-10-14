// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolve = vi.fn();
vi.mock("@/lib/native", () => ({ native: { gitResolveRepo: (d: string) => resolve(d) } }));

import { _resetDirGitStore, demandDir, getDirGit, refreshDemandedDirs } from "./dirGitStore";
import { setRunningCommand } from "./terminalEphemeralStore";

const flush = () => new Promise((r) => setTimeout(r, 0));
const repo = (branch: string, isDetached = false) => ({
  repoRoot: "/r",
  branch,
  upstream: null,
  isDetached,
  isWorktree: false,
});

describe("dirGitStore", () => {
  beforeEach(() => {
    _resetDirGitStore();
    resolve.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("does not touch git for a directory nobody asked about", () => {
    expect(getDirGit("/r")).toEqual({ branch: "", repoRoot: "" });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("resolves the branch once demanded and caches it", async () => {
    resolve.mockResolvedValue(repo("main"));
    const release = demandDir("/r");
    await flush();
    expect(getDirGit("/r")).toEqual({ branch: "main", repoRoot: "/r" });
    release();
  });

  it("reports an empty branch for a detached HEAD and for a non-repo", async () => {
    resolve.mockResolvedValueOnce(repo("abc", true)).mockResolvedValueOnce(null);
    const a = demandDir("/d");
    const b = demandDir("/n");
    await flush();
    expect(getDirGit("/d").branch).toBe("");
    expect(getDirGit("/n")).toEqual({ branch: "", repoRoot: "" });
    a();
    b();
  });

  it("refreshes demanded directories when asked and picks up a new branch", async () => {
    resolve.mockResolvedValueOnce(repo("main")).mockResolvedValueOnce(repo("feat"));
    const release = demandDir("/r");
    await flush();
    refreshDemandedDirs();
    await flush();
    expect(getDirGit("/r").branch).toBe("feat");
    release();
  });

  it("refreshes shortly after a command finishes, and stops once nothing is demanded", async () => {
    vi.useFakeTimers();
    resolve.mockResolvedValue(repo("main"));
    const release = demandDir("/r");
    await vi.advanceTimersByTimeAsync(0);
    resolve.mockClear();
    setRunningCommand("t1", "git checkout x");
    setRunningCommand("t1", null);
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve).toHaveBeenCalledTimes(1);

    release();
    resolve.mockClear();
    setRunningCommand("t1", "ls");
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve).not.toHaveBeenCalled();
    setRunningCommand("t1", null);
  });
});

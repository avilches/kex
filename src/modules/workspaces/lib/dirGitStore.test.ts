// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolve = vi.fn();
vi.mock("@/lib/native", () => ({ native: { gitResolveRepo: (d: string) => resolve(d) } }));

import {
  _resetDirGitStore,
  demandDir,
  getDirGit,
  refreshDemandedDirs,
  refreshDirsOf,
  subscribeDirGit,
} from "./dirGitStore";
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

  it("refreshes only the folder of the terminal whose command just finished", async () => {
    vi.useFakeTimers();
    resolve.mockImplementation(async (d: string) => ({ ...repo("main"), repoRoot: d }));
    const a = demandDir("/a", "t1");
    const b = demandDir("/b", "t2");
    await vi.advanceTimersByTimeAsync(0);
    resolve.mockClear();
    setRunningCommand("t1", "git checkout x");
    setRunningCommand("t1", null);
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve.mock.calls).toEqual([["/a"]]);
    a();
    b();
  });

  it("does not refresh when a command starts, only when it ends", async () => {
    vi.useFakeTimers();
    resolve.mockResolvedValue(repo("main"));
    const release = demandDir("/r", "t1");
    await vi.advanceTimersByTimeAsync(0);
    resolve.mockClear();
    setRunningCommand("t1", "ls");
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve).not.toHaveBeenCalled();
    setRunningCommand("t1", null);
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve).toHaveBeenCalledTimes(1);
    release();
  });

  it("ignores a command that finishes in a tab nobody shows git for", async () => {
    vi.useFakeTimers();
    resolve.mockResolvedValue(repo("main"));
    const release = demandDir("/r", "t1");
    await vi.advanceTimersByTimeAsync(0);
    resolve.mockClear();
    setRunningCommand("other", "ls");
    setRunningCommand("other", null);
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve).not.toHaveBeenCalled();
    release();
  });

  it("a folder demanded without a tab is not refreshed by commands", async () => {
    vi.useFakeTimers();
    resolve.mockResolvedValue(repo("main"));
    const release = demandDir("/r");
    await vi.advanceTimersByTimeAsync(0);
    resolve.mockClear();
    setRunningCommand("t1", "ls");
    setRunningCommand("t1", null);
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve).not.toHaveBeenCalled();
    release();
  });

  it("coalesces a burst of finished commands into one query per folder", async () => {
    vi.useFakeTimers();
    resolve.mockResolvedValue(repo("main"));
    const release = demandDir("/r", "t1");
    await vi.advanceTimersByTimeAsync(0);
    resolve.mockClear();
    for (let i = 0; i < 5; i++) {
      setRunningCommand("t1", `c${i}`);
      setRunningCommand("t1", null);
      await vi.advanceTimersByTimeAsync(50);
    }
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve).toHaveBeenCalledTimes(1);
    release();
  });

  it("asks once for a folder shown by several titles of the same tab", async () => {
    vi.useFakeTimers();
    resolve.mockResolvedValue(repo("main"));
    const a = demandDir("/r", "t1");
    const b = demandDir("/r", "t1");
    await vi.advanceTimersByTimeAsync(0);
    resolve.mockClear();
    setRunningCommand("t1", "ls");
    setRunningCommand("t1", null);
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve).toHaveBeenCalledTimes(1);
    a();
    setRunningCommand("t1", "ls");
    setRunningCommand("t1", null);
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve).toHaveBeenCalledTimes(2);
    b();
  });

  it("stops listening once nothing is demanded", async () => {
    vi.useFakeTimers();
    resolve.mockResolvedValue(repo("main"));
    const release = demandDir("/r", "t1");
    await vi.advanceTimersByTimeAsync(0);
    release();
    resolve.mockClear();
    setRunningCommand("t1", "ls");
    setRunningCommand("t1", null);
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("a new branch found in one folder reaches every folder of the same repository without more queries", async () => {
    resolve.mockImplementation(async () => ({ ...repo("main"), repoRoot: "/repo" }));
    const a = demandDir("/repo/src", "t1");
    const b = demandDir("/repo/docs", "t2");
    await flush();
    resolve.mockClear();
    resolve.mockImplementation(async () => ({ ...repo("feat"), repoRoot: "/repo" }));
    refreshDirsOf(["t1"]);
    await flush();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(getDirGit("/repo/src").branch).toBe("feat");
    expect(getDirGit("/repo/docs").branch).toBe("feat");
    a();
    b();
  });

  it("tells listeners only when a branch really changed", async () => {
    resolve.mockResolvedValue(repo("main"));
    const seen = vi.fn();
    const off = subscribeDirGit(seen);
    const release = demandDir("/r", "t1");
    await flush();
    expect(seen).toHaveBeenCalledTimes(1);
    refreshDemandedDirs();
    await flush();
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    release();
  });

  it("refreshes every demanded folder when the window regains focus", async () => {
    resolve.mockResolvedValue(repo("main"));
    const a = demandDir("/a", "t1");
    const b = demandDir("/b", "t2");
    await flush();
    resolve.mockClear();
    window.dispatchEvent(new Event("focus"));
    await flush();
    expect(resolve).toHaveBeenCalledTimes(2);
    a();
    b();
  });
});

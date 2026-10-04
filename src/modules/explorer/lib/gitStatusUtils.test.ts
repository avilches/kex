import { describe, expect, it } from "vitest";
import type { GitChangedFile, GitStatusSnapshot } from "@/lib/native";
import {
  buildGitStatusMap,
  gitStatusCategory,
  lookupGitStatus,
  normalizeGitStatusCode,
  repoRelativePath,
  statusCodeForFile,
} from "./gitStatusUtils";

function file(overrides: Partial<GitChangedFile>): GitChangedFile {
  return {
    path: "a.ts",
    originalPath: null,
    indexStatus: " ",
    worktreeStatus: " ",
    staged: false,
    unstaged: false,
    untracked: false,
    statusLabel: "",
    ...overrides,
  };
}

function snapshot(changedFiles: GitChangedFile[]): GitStatusSnapshot {
  return {
    repoRoot: "/repo",
    branch: "main",
    upstream: null,
    ahead: 0,
    behind: 0,
    isDetached: false,
    truncated: false,
    changedFiles,
  };
}

describe("statusCodeForFile", () => {
  it("maps untracked", () => {
    expect(statusCodeForFile(file({ untracked: true }))).toBe("U");
    expect(statusCodeForFile(file({ worktreeStatus: "U" }))).toBe("U");
  });

  it("prefers worktree status when unstaged, index when staged", () => {
    expect(
      statusCodeForFile(file({ unstaged: true, worktreeStatus: "M" })),
    ).toBe("M");
    expect(statusCodeForFile(file({ staged: true, indexStatus: "A" }))).toBe(
      "A",
    );
  });

  it("normalizes rename/copy to R", () => {
    expect(statusCodeForFile(file({ staged: true, indexStatus: "R" }))).toBe(
      "R",
    );
    expect(statusCodeForFile(file({ staged: true, indexStatus: "C" }))).toBe(
      "R",
    );
  });
});

describe("buildGitStatusMap", () => {
  it("keys by normalized repo-relative path", () => {
    const map = buildGitStatusMap(
      snapshot([
        file({ path: "src/a.ts", unstaged: true, worktreeStatus: "M" }),
        file({ path: "b.ts", untracked: true }),
      ]),
    );
    expect(map.get("src/a.ts")).toBe("M");
    expect(map.get("b.ts")).toBe("U");
  });
});

describe("repoRelativePath", () => {
  it("returns relative path for files under the root", () => {
    expect(repoRelativePath("/repo/src/a.ts", ["/repo"])).toBe("src/a.ts");
  });

  it("returns empty string for the root itself", () => {
    expect(repoRelativePath("/repo", ["/repo"])).toBe("");
  });

  it("returns null when outside every root", () => {
    expect(repoRelativePath("/other/a.ts", ["/repo"])).toBeNull();
  });

  it("normalizes backslashes and trailing slashes", () => {
    expect(repoRelativePath("C:\\repo\\src\\a.ts", ["C:/repo/"])).toBe(
      "src/a.ts",
    );
  });

  it("matches through a symlinked alias root", () => {
    expect(
      repoRelativePath("/tmp/proj/a.ts", ["/private/tmp/proj", "/tmp/proj"]),
    ).toBe("a.ts");
  });
});

describe("lookupGitStatus", () => {
  const map = buildGitStatusMap(
    snapshot([file({ path: "src/a.ts", unstaged: true, worktreeStatus: "M" })]),
  );

  it("resolves an absolute path against the repo root", () => {
    expect(lookupGitStatus(map, "/repo", "/repo/src/a.ts")).toBe("M");
  });

  it("returns null for unchanged and out-of-repo paths", () => {
    expect(lookupGitStatus(map, "/repo", "/repo/src/b.ts")).toBeNull();
    expect(lookupGitStatus(map, "/repo", "/elsewhere/a.ts")).toBeNull();
  });
});

describe("normalizeGitStatusCode", () => {
  // Shared by source-control (staged/unstaged entries) and git-history (per-
  // commit file list) so both surfaces show the same canonical vocabulary
  // instead of leaking git's raw single-letter codes.
  it("maps untracked codes to U", () => {
    expect(normalizeGitStatusCode("?")).toBe("U");
    expect(normalizeGitStatusCode("u")).toBe("U");
  });

  it("maps copied to R, alongside renamed", () => {
    expect(normalizeGitStatusCode("R")).toBe("R");
    expect(normalizeGitStatusCode("C")).toBe("R");
  });

  it("passes through A/D as-is", () => {
    expect(normalizeGitStatusCode("A")).toBe("A");
    expect(normalizeGitStatusCode("D")).toBe("D");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeGitStatusCode(" a ")).toBe("A");
  });

  it("falls back to M for any unrecognized code", () => {
    expect(normalizeGitStatusCode("T")).toBe("M");
    expect(normalizeGitStatusCode("")).toBe("M");
  });
});

describe("gitStatusCategory", () => {
  it("maps each canonical code to its category", () => {
    expect(gitStatusCategory("A")).toBe("added");
    expect(gitStatusCategory("M")).toBe("modified");
    expect(gitStatusCategory("D")).toBe("deleted");
    expect(gitStatusCategory("R")).toBe("renamed");
    expect(gitStatusCategory("U")).toBe("untracked");
  });

  it("groups copied with renamed and the raw ? with untracked", () => {
    expect(gitStatusCategory("C")).toBe("renamed");
    expect(gitStatusCategory("?")).toBe("untracked");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(gitStatusCategory("a")).toBe("added");
    expect(gitStatusCategory(" M ")).toBe("modified");
  });

  it("returns null for an unrecognized code", () => {
    expect(gitStatusCategory("T")).toBeNull();
    expect(gitStatusCategory("")).toBeNull();
  });
});

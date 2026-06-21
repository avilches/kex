import { describe, it, expect } from "vitest";
import {
  appendGitignoreEntry,
  gitignoreEntryFor,
  hasGitignoreEntry,
} from "./gitignore";

const ROOT = "/home/user/repo";

describe("gitignoreEntryFor", () => {
  it("anchors a top-level file with a leading slash", () => {
    expect(gitignoreEntryFor(ROOT, `${ROOT}/secrets.env`, false)).toBe(
      "/secrets.env",
    );
  });

  it("anchors a nested file", () => {
    expect(gitignoreEntryFor(ROOT, `${ROOT}/src/gen/out.ts`, false)).toBe(
      "/src/gen/out.ts",
    );
  });

  it("adds a trailing slash for directories", () => {
    expect(gitignoreEntryFor(ROOT, `${ROOT}/node_modules`, true)).toBe(
      "/node_modules/",
    );
  });

  it("returns null for the repo root itself", () => {
    expect(gitignoreEntryFor(ROOT, ROOT, true)).toBeNull();
  });

  it("returns null for a path outside the repo", () => {
    expect(gitignoreEntryFor(ROOT, "/home/user/other/file.ts", false)).toBeNull();
  });

  it("does not treat a sibling with a shared prefix as inside the repo", () => {
    expect(gitignoreEntryFor(ROOT, "/home/user/repo-2/file.ts", false)).toBeNull();
  });
});

describe("hasGitignoreEntry", () => {
  it("detects an existing exact line", () => {
    expect(hasGitignoreEntry("node_modules/\n/dist/\n", "/dist/")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(hasGitignoreEntry("  /dist/  \n", "/dist/")).toBe(true);
  });

  it("does not match a partial line", () => {
    expect(hasGitignoreEntry("/dist/build\n", "/dist/")).toBe(false);
  });

  it("returns false on empty content", () => {
    expect(hasGitignoreEntry("", "/dist/")).toBe(false);
  });
});

describe("appendGitignoreEntry", () => {
  it("seeds an empty file with a trailing newline", () => {
    expect(appendGitignoreEntry("", "/dist/")).toBe("/dist/\n");
  });

  it("appends after a trailing newline without a blank gap", () => {
    expect(appendGitignoreEntry("a\n", "/dist/")).toBe("a\n/dist/\n");
  });

  it("inserts a separating newline when the file lacks one", () => {
    expect(appendGitignoreEntry("a", "/dist/")).toBe("a\n/dist/\n");
  });

  it("is idempotent when guarded by hasGitignoreEntry", () => {
    const content = "a\n/dist/\n";
    const next = hasGitignoreEntry(content, "/dist/")
      ? content
      : appendGitignoreEntry(content, "/dist/");
    expect(next).toBe(content);
  });
});

import { describe, expect, test } from "vitest";
import { insertToken, titleSubjectForTab, titleVariablesFor } from "./titleVariablesFor";

describe("titleVariablesFor", () => {
  test("a terminal lists the folder, git, host, command and agent variables", () => {
    expect(titleVariablesFor("terminal").map((v) => v.name)).toEqual([
      "cwd",
      "dir",
      "branch",
      "repo",
      "workspace",
      "host",
      "cmd",
      "osc",
      "agent",
      "model",
      "session",
    ]);
  });

  test("a browser only offers the workspace root, the host and the URL", () => {
    expect(titleVariablesFor("browser").map((v) => v.name)).toEqual(["workspace", "host", "url"]);
  });

  test("git history only offers the place and common variables", () => {
    expect(titleVariablesFor("git-history").map((v) => v.name)).toEqual([
      "cwd",
      "dir",
      "branch",
      "repo",
      "workspace",
      "host",
    ]);
  });

  test("only workspaces offer the focused tab's title", () => {
    for (const subject of ["terminal", "editor", "markdown", "browser", "git-diff", "git-history"] as const) {
      expect(titleVariablesFor(subject).map((v) => v.name)).not.toContain("tab");
    }
    expect(titleVariablesFor("workspace").map((v) => v.name)).toContain("tab");
  });

  test("editor covers the file kinds", () => {
    expect(titleVariablesFor(titleSubjectForTab("markdown")).map((v) => v.name)).toContain("file");
    expect(titleVariablesFor(titleSubjectForTab("git-diff")).map((v) => v.name)).toContain("file");
    expect(titleVariablesFor(titleSubjectForTab("git-commit-file")).map((v) => v.name)).toContain("file");
  });

  test("{path} goes with {file}: file kinds and workspaces only", () => {
    expect(titleVariablesFor("editor").map((v) => v.name)).toContain("path");
    expect(titleVariablesFor("workspace").map((v) => v.name)).toContain("path");
    expect(titleVariablesFor("terminal").map((v) => v.name)).not.toContain("path");
    expect(titleVariablesFor("browser").map((v) => v.name)).not.toContain("path");
  });
});

describe("insertToken", () => {
  test("appends at the caret", () => {
    expect(insertToken({ value: "abc", start: 3, end: 3 }, "{dir}")).toEqual({
      value: "abc{dir}",
      caret: 8,
    });
  });

  test("replaces the selection", () => {
    expect(insertToken({ value: "abcde", start: 1, end: 4 }, "{dir}")).toEqual({
      value: "a{dir}e",
      caret: 6,
    });
  });
});

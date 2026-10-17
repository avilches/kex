import { describe, expect, test } from "vitest";
import { insertToken, titleSubjectForTab, titleVariablesFor } from "./titleVariablesFor";

describe("titleVariablesFor", () => {
  test("a terminal lists the folder, git, host, command and agent variables", () => {
    expect(titleVariablesFor("terminal").map((v) => v.name)).toEqual([
      "cwd",
      "dir",
      "branch",
      "repo",
      "host",
      "cmd",
      "osc",
      "agent",
      "session",
    ]);
  });

  test("a browser only offers the host and the URL", () => {
    expect(titleVariablesFor("browser").map((v) => v.name)).toEqual(["host", "url"]);
  });

  test("git history only offers the place and common variables", () => {
    expect(titleVariablesFor("git-history").map((v) => v.name)).toEqual([
      "cwd",
      "dir",
      "branch",
      "repo",
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

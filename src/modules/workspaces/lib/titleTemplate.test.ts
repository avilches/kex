import { describe, expect, it } from "vitest";
import { expandTitle, hasTitleVariables, titleVariablesUsed } from "./titleTemplate";

describe("expandTitle", () => {
  it("returns a title without braces untouched, whitespace included", () => {
    expect(expandTitle("  my  tab ", { cwd: "/x" })).toBe("  my  tab ");
  });

  it("replaces known variables", () => {
    expect(expandTitle("{dir} @ {branch}", { dir: "kex", branch: "main" })).toBe("kex @ main");
  });

  it("replaces a known but empty variable with nothing and tidies spaces", () => {
    expect(expandTitle("{dir} {branch}", { dir: "kex", branch: "" })).toBe("kex");
  });

  it("leaves unknown and out-of-scope variables literal", () => {
    expect(expandTitle("{nope} {tab}", { dir: "kex" })).toBe("{nope} {tab}");
  });

  it("escapes doubled braces", () => {
    expect(expandTitle("{{dir}} {dir}", { dir: "kex" })).toBe("{dir} kex");
  });

  it("returns an empty string when nothing readable is left", () => {
    expect(expandTitle("{branch}", { branch: "" })).toBe("");
  });

  it("does not re-expand a value that itself contains braces", () => {
    expect(expandTitle("{cwd}", { cwd: "/a/{dir}", dir: "x" })).toBe("/a/{dir}");
  });
});

describe("fallback {a|b|c}", () => {
  it("uses the first non-empty value", () => {
    expect(expandTitle("{cmd|osc|cwd}", { cmd: "", osc: "vim", cwd: "/x" })).toBe("vim");
    expect(expandTitle("{cmd|osc|cwd}", { cmd: "ls", osc: "vim", cwd: "/x" })).toBe("ls");
    expect(expandTitle("{cmd|osc|cwd}", { cmd: "", osc: "", cwd: "/x" })).toBe("/x");
  });

  it("is empty when every alternative is empty", () => {
    expect(expandTitle("{cmd|osc}", { cmd: "", osc: "" })).toBe("");
  });

  it("stays literal when any alternative is not a variable of the scope", () => {
    expect(expandTitle("{cmd|tab}", { cmd: "" })).toBe("{cmd|tab}");
  });

  it("tolerates spaces around the bars", () => {
    expect(expandTitle("{cmd | osc}", { cmd: "", osc: "vim" })).toBe("vim");
  });
});

describe("template alternatives", () => {
  it("uses a template alternative when the variables before it are empty", () => {
    const t = "{osc|session|{agent} · {dir}}";
    expect(expandTitle(t, { osc: "", session: "", agent: "claude", dir: "kex" })).toBe("claude · kex");
    expect(expandTitle(t, { osc: "work", session: "", agent: "claude", dir: "kex" })).toBe("work");
  });

  it("leaves a group with one non-variable alternative literal", () => {
    expect(expandTitle("{foo bar}", { dir: "d" })).toBe("{foo bar}");
  });

  it("does not split on a bar inside a nested group", () => {
    expect(expandTitle("{cmd|{osc|dir}}", { cmd: "", osc: "", dir: "d" })).toBe("d");
  });
});

describe("conditional {?var text}", () => {
  it("renders the text only when the variable is not empty", () => {
    const t = "{dir}{?branch · {branch}}";
    expect(expandTitle(t, { dir: "kex", branch: "main" })).toBe("kex · main");
    expect(expandTitle(t, { dir: "kex", branch: "" })).toBe("kex");
  });

  it("drops the leading space of the text once the title is trimmed", () => {
    expect(expandTitle("{?agent [{agent}]}", { agent: "claude" })).toBe("[claude]");
  });

  it("supports a fallback inside the text", () => {
    expect(expandTitle("{?repo {repo|dir}}", { repo: "r", dir: "d" })).toBe("r");
  });

  it("stays literal when the variable is unknown or the group is not closed", () => {
    expect(expandTitle("{?nope x}", { dir: "d" })).toBe("{?nope x}");
    expect(expandTitle("{?dir x", { dir: "d" })).toBe("{?dir x");
  });

  it("nests", () => {
    expect(expandTitle("{?cwd x{?dir y}}", { cwd: "c", dir: "d" })).toBe("x y");
    expect(expandTitle("{?cwd x{?dir y}}", { cwd: "c", dir: "" })).toBe("x");
  });
});

describe("titleVariablesUsed / hasTitleVariables", () => {
  it("lists variable names and ignores escaped braces", () => {
    expect([...titleVariablesUsed("{branch} {{cwd}} {dir}")].sort()).toEqual(["branch", "dir"]);
  });

  it("lists names inside fallbacks and conditionals", () => {
    expect([...titleVariablesUsed("{cmd|osc}{?branch · {repo|dir}}")].sort()).toEqual([
      "branch",
      "cmd",
      "dir",
      "osc",
      "repo",
    ]);
  });

  it("detects braces", () => {
    expect(hasTitleVariables("plain")).toBe(false);
    expect(hasTitleVariables("a {dir}")).toBe(true);
  });
});

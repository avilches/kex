import { describe, expect, it } from "vitest";
import {
  expandTitle,
  hasTitleVariables,
  missingTemplateVariables,
  renderTemplate,
  titleVariablesUsed,
} from "./titleTemplate";

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

describe("conditional on several variables {?a|b text}", () => {
  it("shows the text when any of them has a value", () => {
    const t = "{?cmd|osc [{cmd|osc}]}";
    expect(expandTitle(t, { cmd: "ls", osc: "" })).toBe("[ls]");
    expect(expandTitle(t, { cmd: "", osc: "vim" })).toBe("[vim]");
    expect(expandTitle(t, { cmd: "", osc: "" })).toBe("");
  });

  it("stays literal when any of the names is not a variable of the scope", () => {
    expect(expandTitle("{?cmd|nope x}", { cmd: "ls" })).toBe("{?cmd|nope x}");
  });

  it("counts a blank value as no value", () => {
    expect(expandTitle("{?cmd|osc x}", { cmd: " ", osc: "  " })).toBe("");
  });
});

describe("negated conditional {!a|b text}", () => {
  it("shows the text only when none of them has a value", () => {
    const t = "{?branch on {branch}}{!branch in {dir}}";
    expect(expandTitle(t, { branch: "main", dir: "kex" })).toBe("on main");
    expect(expandTitle(t, { branch: "", dir: "kex" })).toBe("in kex");
  });

  it("with several names it needs all of them empty", () => {
    expect(expandTitle("{!cmd|osc idle}", { cmd: "", osc: "" })).toBe("idle");
    expect(expandTitle("{!cmd|osc idle}", { cmd: "ls", osc: "" })).toBe("");
  });

  it("stays literal for an unknown variable", () => {
    expect(expandTitle("{!nope x}", { dir: "d" })).toBe("{!nope x}");
  });

  it("is reported as used by every name it reads", () => {
    expect([...titleVariablesUsed("{!branch|dir x {repo}}")].sort()).toEqual(["branch", "dir", "repo"]);
  });
});

describe("hostile and malformed templates", () => {
  it("does not resolve inherited object properties as variables", () => {
    expect(expandTitle("{constructor}", { dir: "d" })).toBe("{constructor}");
    expect(expandTitle("{constructor|dir}", { dir: "d" })).toBe("{constructor|dir}");
    expect(expandTitle("{?constructor x}", { dir: "d" })).toBe("{?constructor x}");
  });

  it("survives absurd nesting without throwing", () => {
    const deep = `${"{osc|".repeat(20000)}x${"}".repeat(20000)}`;
    expect(() => expandTitle(deep, { osc: "", dir: "d" })).not.toThrow();
    const deepCond = `${"{?dir ".repeat(20000)}x${"}".repeat(20000)}`;
    expect(() => expandTitle(deepCond, { dir: "d" })).not.toThrow();
  });

  it("expands what follows an unbalanced brace", () => {
    expect(expandTitle("x { {dir}", { dir: "D" })).toBe("x { D");
    expect(expandTitle("{a {dir}", { dir: "D" })).toBe("{a D");
  });

  it("expands variables inside text that merely looks like a group", () => {
    expect(expandTitle('{"a": {dir}}', { dir: "D" })).toBe('{"a": D}');
    expect(expandTitle("{foo bar}", { dir: "D" })).toBe("{foo bar}");
  });

  it("keeps a variable with spaces inside the braces literal, as before", () => {
    expect(expandTitle("{ dir }", { dir: "D" })).toBe("{ dir }");
  });

  it("treats a blank value as empty for conditionals and fallbacks alike", () => {
    expect(expandTitle("{?dir x}", { dir: "  " })).toBe("");
    expect(expandTitle("{dir|file}", { dir: "  ", file: "f" })).toBe("f");
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

describe("renderTemplate", () => {
  it("keeps whitespace and an empty result, unlike expandTitle", () => {
    expect(renderTemplate("  a   {dir}\n", { dir: "x" })).toBe("  a   x\n");
    expect(renderTemplate("{dir}", { dir: "" })).toBe("");
    expect(expandTitle("  a   {dir}\n", { dir: "x" })).toBe("a x");
  });

  it("formats the value that is written but decides emptiness on the raw one", () => {
    const wrap = (v: string) => `<${v}>`;
    expect(renderTemplate("{a|b}", { a: "", b: "z" }, wrap)).toBe("<z>");
    expect(renderTemplate("{a|{b} {c}}", { a: "", b: "1", c: "2" }, wrap)).toBe("<1> <2>");
    expect(renderTemplate("{a|{b}}", { a: "", b: "" }, wrap)).toBe("");
  });
});

describe("missingTemplateVariables", () => {
  it("lists plain and grouped variables that all lack a value, once each", () => {
    expect(missingTemplateVariables("{a} {a} {b|c}", { a: "", b: "", c: " " })).toEqual(["a", "b", "c"]);
  });

  it("skips optional parts, filled groups and unknown names", () => {
    const vars = { a: "1", b: "", c: "", d: "", e: "" };
    expect(missingTemplateVariables("{a}{?b x {c}}{!b y {d}} {e|a} {nope}", vars)).toEqual(["d"]);
  });
});

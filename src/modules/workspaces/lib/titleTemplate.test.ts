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

describe("titleVariablesUsed / hasTitleVariables", () => {
  it("lists variable names and ignores escaped braces", () => {
    expect([...titleVariablesUsed("{branch} {{cwd}} {dir}")].sort()).toEqual(["branch", "dir"]);
  });

  it("detects braces", () => {
    expect(hasTitleVariables("plain")).toBe(false);
    expect(hasTitleVariables("a {dir}")).toBe(true);
  });
});

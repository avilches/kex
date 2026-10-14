import { describe, expect, it } from "vitest";
import { FACTORY_TITLE_DEFAULTS } from "./defaultTitles";
import { templateNeedsGit } from "./useAgentTabTitle";

describe("git demand of title templates", () => {
  it("no factory default asks for the branch or the repo", () => {
    for (const template of Object.values(FACTORY_TITLE_DEFAULTS)) {
      expect(templateNeedsGit(template)).toBe(false);
    }
  });

  it("asks for git when branch or repo appears anywhere in the template", () => {
    expect(templateNeedsGit("{dir}{?branch · {branch}}")).toBe(true);
    expect(templateNeedsGit("{cmd|{repo}}")).toBe(true);
    expect(templateNeedsGit("{?repo x}")).toBe(true);
  });

  it("does not ask for git when the words are only literal text", () => {
    expect(templateNeedsGit("branch repo {{branch}}")).toBe(false);
  });
});

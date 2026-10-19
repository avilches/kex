import { describe, expect, it } from "vitest";
import { FACTORY_TITLE_DEFAULTS, type TitleDefaultKind } from "./defaultTitles";
import { templateNeedsGit } from "./useAgentTabTitle";

describe("git demand of title templates", () => {
  it("only the terminal and agent factory defaults ask for the branch", () => {
    const asking = (Object.keys(FACTORY_TITLE_DEFAULTS) as TitleDefaultKind[]).filter((kind) =>
      templateNeedsGit(FACTORY_TITLE_DEFAULTS[kind]),
    );
    expect(asking.sort()).toEqual(["agent", "terminal"]);
  });

  it("asks for git when branch or repo appears anywhere in the template", () => {
    expect(templateNeedsGit("{dir}{branch? · {branch}}")).toBe(true);
    expect(templateNeedsGit("{cmd|{repo}}")).toBe(true);
    expect(templateNeedsGit("{repo? x}")).toBe(true);
    expect(templateNeedsGit("{cmd|branch?{:}x}")).toBe(true);
  });

  it("does not ask for git when the words are only literal text", () => {
    expect(templateNeedsGit("branch repo {{branch}}")).toBe(false);
  });
});

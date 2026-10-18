import { describe, expect, it } from "vitest";
import { showsAgentMenu } from "./agentMenu";

describe("showsAgentMenu", () => {
  it("is hidden when the tab has no agent session", () => {
    expect(showsAgentMenu(undefined)).toBe(false);
  });

  it("is hidden for OpenCode, which has nothing to show", () => {
    expect(showsAgentMenu({ agent: "opencode" })).toBe(false);
    expect(showsAgentMenu({ agent: "OpenCode" })).toBe(false);
  });

  it("is shown for the agents that report a session file", () => {
    for (const agent of ["claude", "omp", "pi", "codex"]) {
      expect(showsAgentMenu({ agent })).toBe(true);
    }
  });
});

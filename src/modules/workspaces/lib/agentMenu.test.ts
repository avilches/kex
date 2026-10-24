import { describe, expect, it } from "vitest";
import { agentDisplayName, hasTranscriptActions, showsAgentMenu } from "./agentMenu";

describe("agentDisplayName", () => {
  it("spells the agents the way their products do", () => {
    expect(agentDisplayName("opencode")).toBe("OpenCode");
    expect(agentDisplayName("omp")).toBe("OMP");
    expect(agentDisplayName("pi")).toBe("Pi");
    expect(agentDisplayName("codex")).toBe("Codex");
    expect(agentDisplayName("claude")).toBe("Claude");
  });
});

describe("showsAgentMenu", () => {
  it("is hidden when the tab has no agent session", () => {
    expect(showsAgentMenu(undefined)).toBe(false);
  });

  it("is shown for every agent, OpenCode included", () => {
    for (const agent of ["claude", "omp", "pi", "codex", "opencode"]) {
      expect(showsAgentMenu({ agent })).toBe(true);
    }
  });
});

describe("hasTranscriptActions", () => {
  it("is off for OpenCode, whatever the casing", () => {
    expect(hasTranscriptActions({ agent: "opencode" })).toBe(false);
    expect(hasTranscriptActions({ agent: "OpenCode" })).toBe(false);
  });

  it("is on for the agents that report a session file", () => {
    for (const agent of ["claude", "omp", "pi"]) {
      expect(hasTranscriptActions({ agent })).toBe(true);
    }
  });

  it("is on for Codex only when its frame named a rollout", () => {
    expect(hasTranscriptActions({ agent: "codex", meta: { transcriptPath: "/r.jsonl" } })).toBe(true);
    expect(hasTranscriptActions({ agent: "codex", meta: { transcriptPath: "" } })).toBe(false);
    expect(hasTranscriptActions({ agent: "codex", meta: {} })).toBe(false);
    expect(hasTranscriptActions({ agent: "codex" })).toBe(false);
  });
});

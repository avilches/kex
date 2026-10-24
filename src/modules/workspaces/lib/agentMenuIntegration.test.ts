import { describe, expect, it } from "vitest";
import { agentMenuIntegration } from "./agentMenuIntegration";

describe("agentMenuIntegration", () => {
  it("offers to install an agent whose integration is missing", () => {
    for (const agent of ["claude", "opencode", "omp", "pi", "codex"]) {
      expect(agentMenuIntegration(agent, "missing")).toEqual({ mode: "install", agent });
    }
  });

  it("keeps the usual block once the integration is installed", () => {
    expect(agentMenuIntegration("claude", "installed")).toEqual({ mode: "full" });
  });

  it("keeps the usual block while the status is not known, and never offers to install", () => {
    expect(agentMenuIntegration("claude", null)).toEqual({ mode: "full" });
  });

  it("offers nothing when Install could not run", () => {
    for (const status of ["malformed", "uneditable", "unavailable"] as const) {
      expect(agentMenuIntegration("codex", status)).toEqual({ mode: "bare" });
    }
  });

  it("offers nothing for an agent that has no integration, whatever its status", () => {
    expect(agentMenuIntegration("gemini", "missing")).toEqual({ mode: "bare" });
    expect(agentMenuIntegration("gemini", null)).toEqual({ mode: "bare" });
  });

  it("matches the agent name without regard to casing", () => {
    expect(agentMenuIntegration("OpenCode", "missing")).toEqual({ mode: "install", agent: "opencode" });
  });
});

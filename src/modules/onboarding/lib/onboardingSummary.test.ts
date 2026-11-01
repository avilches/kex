import { describe, expect, it } from "vitest";
import { agentSummary, styleOf } from "./onboardingSummary";

describe("styleOf", () => {
  it("names the preset the current values match", () => {
    expect(styleOf("vscode", true)).toBe("vscode");
    expect(styleOf("jetbrains", false)).toBe("jetbrains");
  });

  it("is null for a mix that matches no preset", () => {
    expect(styleOf("vscode", false)).toBeNull();
    expect(styleOf("jetbrains", true)).toBeNull();
  });
});

describe("agentSummary", () => {
  it("splits detected agents into connected and still pending, ignoring the rest", () => {
    expect(
      agentSummary([
        { name: "Claude Code", detected: true, status: "installed" },
        { name: "Codex", detected: true, status: "missing" },
        { name: "Pi", detected: false, status: "missing" },
        { name: "OMP", detected: true, status: "malformed" },
        { name: "OpenCode", detected: true, status: null },
      ]),
    ).toEqual({ installed: ["Claude Code"], pending: ["Codex"] });
  });
});

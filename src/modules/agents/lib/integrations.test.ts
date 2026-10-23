import { describe, expect, it } from "vitest";
import {
  AGENT_LABELS,
  blockOf,
  fromCodexStatus,
  fromInstalledFlag,
  isIntegrationAgent,
  parseInstalledIntegrations,
  withIntegration,
} from "./integrations";

describe("parseInstalledIntegrations", () => {
  it("keeps the known agents once each, in a fixed order", () => {
    expect(parseInstalledIntegrations(["codex", "pi", "omp", "pi", "opencode"])).toEqual([
      "opencode",
      "omp",
      "pi",
      "codex",
    ]);
  });

  it("drops unknown names and non-string entries", () => {
    expect(parseInstalledIntegrations(["claude", "../x", 3, null, "omp"])).toEqual(["omp"]);
  });

  it("returns an empty list for anything that is not an array", () => {
    for (const bad of [undefined, null, "omp", 7, { omp: true }]) {
      expect(parseInstalledIntegrations(bad)).toEqual([]);
    }
  });
});

describe("withIntegration", () => {
  it("adds an agent without duplicating it", () => {
    expect(withIntegration(["omp"], "omp", true)).toEqual(["omp"]);
    expect(withIntegration(["omp"], "pi", true)).toEqual(["omp", "pi"]);
    expect(withIntegration(["codex"], "omp", true)).toEqual(["omp", "codex"]);
  });

  it("removes an agent and leaves the others", () => {
    expect(withIntegration(["opencode", "omp", "pi"], "omp", false)).toEqual(["opencode", "pi"]);
    expect(withIntegration([], "pi", false)).toEqual([]);
  });

  it("does not mutate its input", () => {
    const current = ["omp"] as const;
    withIntegration(current, "pi", true);
    expect(current).toEqual(["omp"]);
  });
});

describe("isIntegrationAgent", () => {
  it("accepts only the managed agents", () => {
    expect(isIntegrationAgent("pi")).toBe(true);
    expect(isIntegrationAgent("codex")).toBe(true);
    expect(isIntegrationAgent("claude")).toBe(false);
    expect(isIntegrationAgent(undefined)).toBe(false);
  });
});

describe("AGENT_LABELS", () => {
  it("names Codex the way its product does", () => {
    expect(AGENT_LABELS.codex).toBe("Codex");
  });
});

describe("integration status", () => {
  it("reads the boolean of the file-based agents as installed or missing", () => {
    expect(fromInstalledFlag(true)).toBe("installed");
    expect(fromInstalledFlag(false)).toBe("missing");
  });

  it("maps every Codex state, an outdated install reading as missing", () => {
    expect(fromCodexStatus("upToDate")).toBe("installed");
    expect(fromCodexStatus("notInstalled")).toBe("missing");
    expect(fromCodexStatus("outdated")).toBe("missing");
    expect(fromCodexStatus("malformed")).toBe("malformed");
    expect(fromCodexStatus("unavailable")).toBe("unavailable");
  });

  it("blocks Install only for a config it cannot parse or a missing folder", () => {
    expect(blockOf("malformed")).toBe("malformed");
    expect(blockOf("unavailable")).toBe("unavailable");
    expect(blockOf("installed")).toBeNull();
    expect(blockOf("missing")).toBeNull();
    expect(blockOf(null)).toBeNull();
  });
});

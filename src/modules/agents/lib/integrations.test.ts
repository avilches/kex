import { describe, expect, it } from "vitest";
import {
  isIntegrationAgent,
  parseInstalledIntegrations,
  withIntegration,
} from "./integrations";

describe("parseInstalledIntegrations", () => {
  it("keeps the known agents once each, in a fixed order", () => {
    expect(parseInstalledIntegrations(["pi", "omp", "pi", "opencode"])).toEqual([
      "opencode",
      "omp",
      "pi",
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
  it("accepts only the three managed agents", () => {
    expect(isIntegrationAgent("pi")).toBe(true);
    expect(isIntegrationAgent("claude")).toBe(false);
    expect(isIntegrationAgent(undefined)).toBe(false);
  });
});

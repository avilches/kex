import { describe, expect, it } from "vitest";
import type { IntegrationAgent } from "./integrations";
import { syncPlan } from "./startupSync";

const none: IntegrationAgent[] = [];
const base = {
  detected: new Set(["claude", "pi"]),
  installed: none,
  claudeHooksInstalled: true,
  agentNotifications: true,
};

describe("syncPlan", () => {
  it("claude not detected does nothing even with notifications on", () => {
    expect(syncPlan({ ...base, detected: new Set() }).claude).toBe("none");
  });
  it("claude detected with hooks installed refreshes", () => {
    expect(syncPlan(base).claude).toBe("refresh");
  });
  it("claude detected with hooks installed and notifications off disables", () => {
    expect(syncPlan({ ...base, agentNotifications: false }).claude).toBe("disable");
  });
  it("claude detected with hooks missing does nothing", () => {
    expect(syncPlan({ ...base, claudeHooksInstalled: false }).claude).toBe("none");
  });
  it("others keeps only detected installed integrations", () => {
    expect(syncPlan({ ...base, installed: ["pi", "omp"] }).others).toEqual(["pi"]);
  });
  it("empty detected set syncs nothing", () => {
    const p = syncPlan({ ...base, detected: new Set(), installed: ["pi"] });
    expect(p).toEqual({ claude: "none", others: [] });
  });
});

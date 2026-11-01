import { describe, expect, it } from "vitest";
import type { RowState } from "./agentRows";
import { planBulk, runBulk } from "./bulkIntegration";
import type { AgentId } from "./integrations";

const blocked: RowState = { kind: "blocked", block: "foreign" as never };
const states: Partial<Record<AgentId, RowState>> = {
  claude: { kind: "missing" },
  codex: { kind: "installed" },
  opencode: { kind: "missing" },
  omp: blocked,
  pi: { kind: "notDetected" },
};

describe("planBulk", () => {
  it("install only picks missing", () => {
    expect(planBulk("install", states)).toEqual(["claude", "opencode"]);
  });
  it("remove only picks installed", () => {
    expect(planBulk("remove", states)).toEqual(["codex"]);
  });
  it("ignores blocked, notDetected and detectedOnly", () => {
    const s: Partial<Record<AgentId, RowState>> = {
      omp: blocked,
      pi: { kind: "notDetected" },
      codex: { kind: "detectedOnly" },
    };
    expect(planBulk("install", s)).toEqual([]);
    expect(planBulk("remove", s)).toEqual([]);
  });
});

describe("runBulk", () => {
  it("continues after a failure and reports it", async () => {
    const run = async (a: AgentId) => {
      if (a === "claude") throw new Error("x");
    };
    const r = await runBulk("install", states, run);
    expect(r.failed).toEqual(["claude"]);
    expect(r.done).toEqual(["opencode"]);
  });
  it("reports skipped agents", async () => {
    const r = await runBulk("install", states, async () => {});
    expect(r.skipped).toEqual(["codex", "omp", "pi"]);
  });
});

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
  it("starts every run before the first one finishes", async () => {
    const all: Partial<Record<AgentId, RowState>> = {
      claude: { kind: "missing" },
      codex: { kind: "missing" },
      opencode: { kind: "missing" },
    };
    const started: AgentId[] = [];
    const finish: Partial<Record<AgentId, (ok: boolean) => void>> = {};
    const run = (a: AgentId) =>
      new Promise<void>((resolve, reject) => {
        started.push(a);
        finish[a] = (ok) => (ok ? resolve() : reject(new Error(a)));
      });
    const pending = runBulk("install", all, run);
    await Promise.resolve();
    expect(started).toEqual(["claude", "codex", "opencode"]);
    finish.opencode?.(true);
    finish.claude?.(false);
    finish.codex?.(true);
    const r = await pending;
    expect(r).toEqual({ done: ["codex", "opencode"], failed: ["claude"], skipped: [] });
  });
  it("a rejection does not stop the others and failures keep the agent order", async () => {
    const all: Partial<Record<AgentId, RowState>> = {
      claude: { kind: "installed" },
      codex: { kind: "installed" },
      opencode: { kind: "installed" },
      pi: { kind: "missing" },
    };
    const ran: AgentId[] = [];
    const r = await runBulk("remove", all, async (a) => {
      ran.push(a);
      if (a !== "codex") throw new Error(a);
    });
    expect(ran).toEqual(["claude", "codex", "opencode"]);
    expect(r).toEqual({ done: ["codex"], failed: ["claude", "opencode"], skipped: ["pi"] });
  });
});

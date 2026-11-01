import { describe, expect, it } from "vitest";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { KNOWN_AGENTS, detectedAgentIds, rowStateOf } from "./agentRows";

const ed = (id: string, kind: "editor" | "agent", enabled?: boolean): DetectedEditor => ({
  id,
  name: id,
  binary: id,
  argsBeforePath: [],
  kind,
  enabled,
});

describe("rowStateOf", () => {
  it("not detected wins over any status", () => {
    expect(rowStateOf({ detected: false, hasIntegration: true, status: "installed" })).toEqual({ kind: "notDetected" });
  });
  it("detected without integration is detectedOnly", () => {
    expect(rowStateOf({ detected: true, hasIntegration: false, status: null })).toEqual({ kind: "detectedOnly" });
  });
  it("status null while detected is checking", () => {
    expect(rowStateOf({ detected: true, hasIntegration: true, status: null })).toEqual({ kind: "checking" });
  });
  it("maps missing and installed", () => {
    expect(rowStateOf({ detected: true, hasIntegration: true, status: "missing" })).toEqual({ kind: "missing" });
    expect(rowStateOf({ detected: true, hasIntegration: true, status: "installed" })).toEqual({ kind: "installed" });
  });
  it.each(["malformed", "uneditable", "unavailable"] as const)("%s is blocked", (block) => {
    expect(rowStateOf({ detected: true, hasIntegration: true, status: block })).toEqual({ kind: "blocked", block });
  });
});

describe("detectedAgentIds", () => {
  it("keeps only agents", () => {
    const ids = detectedAgentIds([ed("code", "editor"), ed("claude", "agent"), ed("pi", "agent")]);
    expect([...ids].sort()).toEqual(["claude", "pi"]);
  });
  it("ignores enabled false", () => {
    expect(detectedAgentIds([ed("claude", "agent", false)]).has("claude")).toBe(true);
  });
});

describe("KNOWN_AGENTS", () => {
  it("lists eleven agents once each", () => {
    expect(KNOWN_AGENTS).toHaveLength(11);
    expect(new Set(KNOWN_AGENTS.map((a) => a.id)).size).toBe(11);
  });
  it("only the five integrable ones carry an integration id", () => {
    const withInt = KNOWN_AGENTS.filter((a) => a.integration !== null);
    expect(withInt.map((a) => a.id).sort()).toEqual(["claude", "codex", "omp", "opencode", "pi"]);
    for (const a of withInt) expect(a.integration).toBe(a.id);
  });
});

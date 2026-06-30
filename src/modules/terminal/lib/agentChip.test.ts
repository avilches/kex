import { describe, expect, it } from "vitest";
import { agentChip } from "./agentChip";

describe("agentChip", () => {
  it("working, attention, and idle each produce a distinct dotClass", () => {
    const w = agentChip("working");
    const a = agentChip("attention");
    const f = agentChip("idle");
    expect(new Set([w.dotClass, a.dotClass, f.dotClass]).size).toBe(3);
    expect(w.title.length).toBeGreaterThan(0);
    expect(a.title.length).toBeGreaterThan(0);
    expect(f.title.length).toBeGreaterThan(0);
  });

  it("working dot is amber", () => {
    expect(agentChip("working").dotClass).toContain("amber");
  });

  it("attention dot signals attention (not amber, not green)", () => {
    const { dotClass } = agentChip("attention");
    expect(dotClass).not.toContain("amber");
    expect(dotClass).not.toContain("emerald");
  });

  it("idle dot is muted/green", () => {
    expect(agentChip("idle").dotClass).toContain("emerald");
  });
});

import { describe, expect, it } from "vitest";
import type { DetectedEditor } from "./types";
import { mergeEnabled, splitDetected } from "./useExternalEditors";

const mk = (
  id: string,
  kind: "editor" | "agent",
  enabled?: boolean,
): DetectedEditor => ({
  id,
  name: id,
  binary: id,
  argsBeforePath: [],
  kind,
  enabled,
});

describe("splitDetected", () => {
  it("splits a mixed list by kind", () => {
    const r = splitDetected([mk("code", "editor"), mk("claude", "agent")]);
    expect(r.detectedEditors.map((e) => e.id)).toEqual(["code"]);
    expect(r.detectedAgents.map((e) => e.id)).toEqual(["claude"]);
  });
});

describe("mergeEnabled", () => {
  it("keeps user enabled flags for both kinds", () => {
    const merged = mergeEnabled(
      [mk("code", "editor"), mk("claude", "agent"), mk("pi", "agent")],
      [mk("code", "editor", false), mk("claude", "agent", false)],
    );
    expect(merged.map((e) => e.enabled)).toEqual([false, false, undefined]);
  });
});

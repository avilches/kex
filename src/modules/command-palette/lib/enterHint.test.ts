import { describe, expect, it } from "vitest";
import { enterHintOf } from "./enterHint";
import type { MergedRow } from "./mergeRows";

const rows = [
  { kind: "tab", key: "tab:a" },
  { kind: "command", key: "cmd:x" },
  { kind: "workspace", key: "ws:w" },
  { kind: "closed", key: "closed:file:/a" },
] as MergedRow[];

describe("enterHintOf", () => {
  it("names the row kind", () => {
    expect(enterHintOf("tab:a", rows)).toBe("Select tab");
    expect(enterHintOf("cmd:x", rows)).toBe("Run action");
    expect(enterHintOf("ws:w", rows)).toBe("Select workspace");
    expect(enterHintOf("closed:file:/a", rows)).toBe("Reopen");
  });

  it("falls back to a plain Select", () => {
    expect(enterHintOf("hist:ls", rows)).toBe("Select");
  });
});

import { describe, expect, it } from "vitest";
import { enterHintOf } from "./enterHint";
import type { MergedRow } from "./mergeRows";

const tab = (hibernated: boolean) => ({ hibernated, tab: { kind: "terminal" } });

const rows = [
  { kind: "tab", key: "tab:a", entry: tab(false) },
  { kind: "tab", key: "tab:z", entry: tab(true) },
  { kind: "command", key: "cmd:x" },
  { kind: "workspace", key: "ws:w", entry: { root: null, canHibernate: false, tabCount: 0 } },
  { kind: "closed", key: "closed:file:/a", entry: { key: "closed:file:/a" } },
] as unknown as MergedRow[];

describe("enterHintOf", () => {
  it("repeats the Enter item of the row menu", () => {
    expect(enterHintOf("tab:a", rows)).toBe("Go to Tab");
    expect(enterHintOf("tab:z", rows)).toBe("Restore and go to Tab");
    expect(enterHintOf("cmd:x", rows)).toBe("Run action");
    expect(enterHintOf("ws:w", rows)).toBe("Go to Workspace");
    expect(enterHintOf("closed:file:/a", rows)).toBe("Reopen Closed Tab");
  });

  it("falls back to a plain Select", () => {
    expect(enterHintOf("hist:ls", rows)).toBe("Select");
  });
});

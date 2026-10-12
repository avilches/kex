import { describe, expect, it } from "vitest";
import { pendingLines, runOnStartSections } from "./runOnStartSections";

const block = { reason: "r", dir: "/my dir", command: "claude --resume 'a'", restorable: true };

describe("runOnStartSections", () => {
  it("shows the Enabled switch and the old error when nothing is pending", () => {
    expect(runOnStartSections(null)).toEqual({ showEnabled: true, showOldError: true });
  });
  it("hides both while a restore is pending", () => {
    expect(runOnStartSections(block)).toEqual({ showEnabled: false, showOldError: false });
  });
});

describe("pendingLines", () => {
  it("quotes the directory as it will be typed", () => {
    expect(pendingLines(block)).toEqual({ cd: "cd '/my dir'", command: "claude --resume 'a'" });
  });
  it("has no cd line without a directory", () => {
    expect(pendingLines({ ...block, dir: "" }).cd).toBe("");
  });
});

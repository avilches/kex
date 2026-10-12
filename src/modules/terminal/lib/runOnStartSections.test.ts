import { describe, expect, it } from "vitest";
import { pendingCdLine, runOnStartSections } from "./runOnStartSections";

const block = { reason: "r", dir: "/my dir", command: "claude --resume 'a'", restorable: true };

describe("runOnStartSections", () => {
  it("shows the Enabled switch and the old error when nothing is pending", () => {
    expect(runOnStartSections(null)).toEqual({ showEnabled: true, showOldError: true });
  });
  it("hides both while a restore is pending", () => {
    expect(runOnStartSections(block)).toEqual({ showEnabled: false, showOldError: false });
  });
});

describe("pendingCdLine", () => {
  it("quotes the directory as it will be typed", () => {
    expect(pendingCdLine(block)).toBe("cd '/my dir'");
  });
  it("is empty without a directory", () => {
    expect(pendingCdLine({ ...block, dir: "" })).toBe("");
  });
});

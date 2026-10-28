import { describe, expect, it } from "vitest";
import { pendingCdLine, restoreCommandSections } from "./restoreCommandSections";

const block = { reason: "r", dir: "/my dir", command: "claude --resume 'a'", restorable: true };

describe("restoreCommandSections", () => {
  it("shows the old error when nothing is pending", () => {
    expect(restoreCommandSections(null)).toEqual({ showOldError: true });
  });
  it("hides it while a restore is pending, since the block carries the reason", () => {
    expect(restoreCommandSections(block)).toEqual({ showOldError: false });
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

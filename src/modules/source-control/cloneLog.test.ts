import { describe, expect, it } from "vitest";
import { appendCloneLog, cloneFailureMessage } from "./cloneLog";

describe("the clone log", () => {
  it("keeps the fatal line from an earlier tick when the last tick brings nothing new", () => {
    let log = "";
    log = appendCloneLog(log, "Cloning into 'x'...\n", false);
    log = appendCloneLog(log, "fatal: repository 'https://h/x' not found\n", false);
    log = appendCloneLog(log, "", false);
    expect(cloneFailureMessage(log, 128)).toBe("Cloning into 'x'...\nfatal: repository 'https://h/x' not found");
  });

  it("shows only the last three lines", () => {
    const log = ["a", "b", "c", "d", "e"].join("\n");
    expect(cloneFailureMessage(log, 1)).toBe("c\nd\ne");
  });

  it("falls back to the exit code with no output", () => {
    expect(cloneFailureMessage("  \n", 128)).toBe("Clone failed (exit 128)");
    expect(cloneFailureMessage("", null)).toBe("Clone failed (exit ?)");
  });

  it("replaces the log when the backend dropped old output, and bounds its size", () => {
    expect(appendCloneLog("old", "everything left", true)).toBe("everything left");
    expect(appendCloneLog("", "x".repeat(20000), false)).toHaveLength(8192);
  });
});

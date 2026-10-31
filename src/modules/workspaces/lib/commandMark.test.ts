import { describe, expect, it } from "vitest";
import { getCommandFailed, setCommandFailed } from "./terminalEphemeralStore";
import { tabStatusIndicator } from "./tabStatusIndicator";
import { commandMark } from "./useCommandMark";

const none = { restoreBusy: false, restorePending: false, hasAgent: false, isRestoreError: false, status: undefined };

describe("command mark of a plain terminal", () => {
  it("a running command wins over the previous failure", () => {
    expect(commandMark(true, true)).toBe("working");
    expect(commandMark(false, true)).toBe("error");
    expect(commandMark(false, false)).toBeNull();
  });

  it("spins while running and shows a red dot after a failure", () => {
    expect(tabStatusIndicator({ ...none, commandMark: "working" })).toBe("working");
    expect(tabStatusIndicator({ ...none, commandMark: "error" })).toBe("interrupted");
  });

  it("leaves agent tabs to their own state", () => {
    expect(tabStatusIndicator({ ...none, hasAgent: true, status: "idle", commandMark: "error" })).toBeNull();
  });

  it("keeps the failure until a clean command clears it", () => {
    setCommandFailed("tab-f", true);
    expect(getCommandFailed("tab-f")).toBe(true);
    setCommandFailed("tab-f", false);
    expect(getCommandFailed("tab-f")).toBe(false);
  });
});

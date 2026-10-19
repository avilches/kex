import { describe, expect, it } from "vitest";
import { tabStatusIndicator } from "./tabStatusIndicator";

const none = { restoreBusy: false, restorePending: false, hasAgent: false, isRestoreError: false, status: undefined };

describe("tabStatusIndicator", () => {
  it("shows nothing for a plain tab", () => {
    expect(tabStatusIndicator(none)).toBeNull();
  });

  it("shows the agent states as before", () => {
    expect(tabStatusIndicator({ ...none, hasAgent: true, status: "working" })).toBe("working");
    expect(tabStatusIndicator({ ...none, hasAgent: true, status: "attention" })).toBe("attention");
    expect(tabStatusIndicator({ ...none, hasAgent: true, status: "idle" })).toBeNull();
  });

  it("marks a session whose work was cut by a restart, over the spinner", () => {
    expect(tabStatusIndicator({ ...none, hasAgent: true, interrupted: true, status: "working" })).toBe("interrupted");
    expect(tabStatusIndicator({ ...none, hasAgent: true, interrupted: true, status: "idle" })).toBe("interrupted");
  });

  it("marks a failed agent restore", () => {
    expect(tabStatusIndicator({ ...none, hasAgent: true, isRestoreError: true, status: "working" })).toBe("restore-failed");
  });

  it("marks a pending restore even without an agent session", () => {
    expect(tabStatusIndicator({ ...none, restorePending: true })).toBe("restore-failed");
  });

  it("a retry in flight wins over everything, for tabs with and without an agent", () => {
    expect(tabStatusIndicator({ ...none, restoreBusy: true })).toBe("restoring");
    expect(tabStatusIndicator({ ...none, restoreBusy: true, restorePending: true, hasAgent: true, isRestoreError: true })).toBe(
      "restoring",
    );
  });

  it("falls back to the failure marker when the retry ends and the plan is still pending", () => {
    const after = { ...none, restorePending: true, hasAgent: true, isRestoreError: true, status: "working" as const };
    expect(tabStatusIndicator({ ...after, restoreBusy: true })).toBe("restoring");
    expect(tabStatusIndicator({ ...after, restoreBusy: false })).toBe("restore-failed");
  });
});

import { describe, expect, it } from "vitest";
import { dropsStoredSession } from "./sessionRecordPolicy";

describe("dropsStoredSession", () => {
  it("drops the record when the agent process exits", () => {
    expect(dropsStoredSession("exited")).toBe(true);
  });

  it("keeps the record when a turn fails, since the process is still alive", () => {
    expect(dropsStoredSession("StopFailure")).toBe(false);
  });

  it("keeps the record on SessionEnd, which /clear and /resume also emit", () => {
    expect(dropsStoredSession("SessionEnd")).toBe(false);
  });

  it("keeps the record for every other signal", () => {
    for (const kind of ["started", "UserPromptSubmit", "Notification", "Stop", "PermissionRequest", "MessageDisplay"] as const) {
      expect(dropsStoredSession(kind)).toBe(false);
    }
  });
});

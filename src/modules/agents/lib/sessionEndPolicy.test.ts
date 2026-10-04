import { describe, expect, it } from "vitest";
import { endsAgentSession } from "./sessionEndPolicy";

describe("endsAgentSession", () => {
  it("ends the session when the agent process exits", () => {
    expect(endsAgentSession("exited")).toBe(true);
  });

  it("keeps the session when a turn fails, since the process is still alive", () => {
    expect(endsAgentSession("StopFailure")).toBe(false);
  });

  it("keeps the session on SessionEnd, which /clear and /resume also emit", () => {
    expect(endsAgentSession("SessionEnd")).toBe(false);
  });

  it("keeps the session for every other signal", () => {
    for (const kind of ["started", "UserPromptSubmit", "Notification", "Stop", "PermissionRequest", "MessageDisplay"] as const) {
      expect(endsAgentSession(kind)).toBe(false);
    }
  });
});

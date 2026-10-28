import { describe, expect, it } from "vitest";

import { agentIconMark } from "./agentRestore";

describe("agentIconMark", () => {
  const unknown = { meta: { launchKnown: false } };
  const known = { meta: { launchKnown: true } };

  it("marks a session whose launcher was not recognised", () => {
    expect(agentIconMark(unknown)).toBe("launch-unknown");
  });

  it("does not mark a recognised launcher or a session with no launch information yet", () => {
    expect(agentIconMark(known)).toBeNull();
    expect(agentIconMark({ meta: {} })).toBeNull();
    expect(agentIconMark({ meta: undefined })).toBeNull();
    expect(agentIconMark(undefined)).toBeNull();
  });
});

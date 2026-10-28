import { describe, expect, it } from "vitest";

import { agentIconMark } from "./agentRestore";
import type { Tab } from "./types";

const terminal = (): Tab => ({ id: "tab-1", kind: "terminal" });

describe("agentIconMark", () => {
  const unknown = { meta: { launchKnown: false } };
  const known = { meta: { launchKnown: true } };

  it("marks a session whose launcher was not recognised", () => {
    expect(agentIconMark(terminal(), unknown)).toBe("launch-unknown");
  });

  it("does not mark a recognised launcher or a session with no launch information yet", () => {
    expect(agentIconMark(terminal(), known)).toBeNull();
    expect(agentIconMark(terminal(), { meta: {} })).toBeNull();
    expect(agentIconMark(terminal(), { meta: undefined })).toBeNull();
    expect(agentIconMark(terminal(), undefined)).toBeNull();
  });
});

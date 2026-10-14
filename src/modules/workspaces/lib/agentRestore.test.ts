import { describe, expect, it } from "vitest";

import { agentIconMark, agentRestoreDisabled } from "./agentRestore";
import type { Tab } from "./types";

const terminal = (restoreOnRestart?: boolean): Tab => ({
  id: "tab-1",
  kind: "terminal",
  restoreOnRestart,
});

describe("agentRestoreDisabled", () => {
  it("is true when Run on start was explicitly turned off", () => {
    expect(agentRestoreDisabled(terminal(false))).toBe(true);
  });

  it("is false when Run on start is on", () => {
    expect(agentRestoreDisabled(terminal(true))).toBe(false);
  });

  it("is false when unset, because agent tabs default to restoring", () => {
    expect(agentRestoreDisabled(terminal(undefined))).toBe(false);
  });

  it("is false for non-terminal tabs", () => {
    const browser = { id: "tab-2", kind: "browser" } as unknown as Tab;
    expect(agentRestoreDisabled(browser)).toBe(false);
  });
});

describe("agentIconMark", () => {
  const unknown = { meta: { launchKnown: false } };
  const known = { meta: { launchKnown: true } };

  it("marks a session whose launcher was not recognised", () => {
    expect(agentIconMark(terminal(undefined), unknown)).toBe("launch-unknown");
  });

  it("does not mark a recognised launcher or a session with no launch information yet", () => {
    expect(agentIconMark(terminal(undefined), known)).toBeNull();
    expect(agentIconMark(terminal(undefined), { meta: {} })).toBeNull();
    expect(agentIconMark(terminal(undefined), { meta: undefined })).toBeNull();
    expect(agentIconMark(terminal(undefined), undefined)).toBeNull();
  });

  it("lets Run on start off win over an unknown launcher", () => {
    expect(agentIconMark(terminal(false), unknown)).toBe("restore-off");
    expect(agentIconMark(terminal(false), known)).toBe("restore-off");
  });
});

import { describe, expect, it } from "vitest";

import { agentRestoreDisabled } from "./agentRestore";
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

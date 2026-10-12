import { describe, expect, it } from "vitest";
import { planDelayedWrite, planScriptStop } from "./scriptRunState";
import type { ScriptState } from "./terminalEphemeralStore";

describe("planDelayedWrite", () => {
  it("writes when the mark is still running and the terminal is mounted", () => {
    expect(planDelayedWrite("running", true, 0)).toBe("write");
  });

  it("retries while the terminal is not mounted, then gives up", () => {
    expect(planDelayedWrite("running", false, 0)).toBe("retry");
    expect(planDelayedWrite("running", false, 19)).toBe("retry");
    expect(planDelayedWrite("running", false, 20)).toBe("abandon");
  });

  it("abandons when Stop or anything else changed the mark", () => {
    expect(planDelayedWrite("waiting", true, 0)).toBe("abandon");
    expect(planDelayedWrite(undefined, true, 0)).toBe("abandon");
  });
});

describe("planScriptStop", () => {
  it("waits for the end of a command that was seen", () => {
    expect(planScriptStop(true)).toBe("waiting");
  });

  it("clears the mark when no command ever started", () => {
    expect(planScriptStop(false)).toBe(false);
  });
});

describe("Stop interleaved with the delayed write", () => {
  it("leaves no mark behind and writes nothing", () => {
    let mark: ScriptState | undefined = "running";
    const written: string[] = [];
    const tryWrite = () => {
      if (planDelayedWrite(mark, true, 0) === "write") written.push("cmd");
      else mark = undefined;
    };
    mark = planScriptStop(false) || undefined;
    tryWrite();
    expect(written).toEqual([]);
    expect(mark).toBeUndefined();
  });

  it("clears a stale waiting mark when the write bails out", () => {
    let mark: ScriptState | undefined = "waiting";
    if (planDelayedWrite(mark, true, 0) === "abandon") mark = undefined;
    expect(mark).toBeUndefined();
  });
});

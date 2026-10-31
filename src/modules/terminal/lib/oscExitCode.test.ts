import { describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { createShellIntegrationState, registerPromptTracker } from "./osc-handlers";

describe("registerPromptTracker exit codes", () => {
  it("reports the exit code of OSC 133 D", () => {
    let handler: (data: string) => boolean = () => true;
    const term = {
      parser: {
        registerOscHandler: (_: number, h: (data: string) => boolean) => {
          handler = h;
          return { dispose: () => {} };
        },
      },
      registerMarker: () => ({ dispose: () => {} }),
    } as unknown as Terminal;
    const onExit = vi.fn();
    registerPromptTracker(term, createShellIntegrationState(), undefined, onExit);
    handler("D;2");
    handler("D;0");
    handler("D");
    expect(onExit.mock.calls).toEqual([[2], [0]]);
  });
});

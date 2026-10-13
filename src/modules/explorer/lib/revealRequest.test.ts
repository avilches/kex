import { describe, expect, it } from "vitest";
import {
  initialConsumedNonce,
  revealForWorkspace,
  shouldConsumeReveal,
  type RevealRequest,
} from "./revealRequest";

const req = (nonce: number, workspaceId = "ws-a"): RevealRequest => ({
  path: "/p/a.ts",
  nonce,
  workspaceId,
});

describe("reveal request consumption", () => {
  it("does not replay a request that was already present when the explorer mounted", () => {
    const present = req(4);
    expect(shouldConsumeReveal(present, initialConsumedNonce(present))).toBe(false);
  });

  it("acts on a request issued after the mount", () => {
    expect(shouldConsumeReveal(req(5), initialConsumedNonce(req(4)))).toBe(true);
    expect(shouldConsumeReveal(req(1), initialConsumedNonce(null))).toBe(true);
  });

  it("ignores a missing request and one already consumed", () => {
    expect(shouldConsumeReveal(null, null)).toBe(false);
    expect(shouldConsumeReveal(req(3), 3)).toBe(false);
  });
});

describe("revealForWorkspace", () => {
  it("passes a request issued for the shown workspace", () => {
    const r = req(2, "ws-a");
    expect(revealForWorkspace(r, "ws-a")).toBe(r);
  });

  it("drops a request issued for another workspace", () => {
    expect(revealForWorkspace(req(2, "ws-b"), "ws-a")).toBeNull();
    expect(revealForWorkspace(req(2, "ws-b"), null)).toBeNull();
    expect(revealForWorkspace(null, "ws-a")).toBeNull();
  });
});

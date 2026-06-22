import { describe, expect, it } from "vitest";
import { sanitizePanel } from "./workspaceState";
import type { Panel } from "./types";

describe("sanitizePanel", () => {
  it("preserves the terminal autofocus flag", () => {
    const p: Panel = { id: "t1", kind: "terminal", cwd: "/a", autofocus: true };
    expect(sanitizePanel(p)).toMatchObject({ autofocus: true });
  });
});

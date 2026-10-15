import { describe, expect, it } from "vitest";

import { spawnCwdUpdate } from "./spawnCwd";

describe("spawnCwdUpdate", () => {
  it("returns the reported folder when the tab has none yet", () => {
    expect(spawnCwdUpdate(null, "/repo")).toBe("/repo");
  });

  it("returns the reported folder when it differs from the last known one", () => {
    expect(spawnCwdUpdate("/old", "/repo")).toBe("/repo");
  });

  it("returns null when the PTY had no folder to report", () => {
    expect(spawnCwdUpdate("/repo", null)).toBeNull();
    expect(spawnCwdUpdate(null, null)).toBeNull();
  });

  it("returns null when the report matches the last known folder", () => {
    expect(spawnCwdUpdate("/repo", "/repo")).toBeNull();
  });
});
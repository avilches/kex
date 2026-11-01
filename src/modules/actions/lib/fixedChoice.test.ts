import { describe, expect, it } from "vitest";
import { needsFolder, normalizeAction, updateAction, withFixedCwd, withRuns } from "./actions";
import type { Action } from "./types";

const saved: Action = { id: "a", name: "Dev", kind: "script", command: "pnpm dev", runs: "workspace", ownButton: false };

describe("a script that runs in one fixed folder", () => {
  it("needs a folder before the store can take the choice", () => {
    expect(needsFolder("fixed", undefined)).toBe(true);
    expect(needsFolder("fixed", "   ")).toBe(true);
    expect(needsFolder("fixed", "/srv")).toBe(false);
    expect(needsFolder("workspace", undefined)).toBe(false);
  });

  it("is never held by the store without its folder: the previous place stays", () => {
    const [after] = updateAction([saved], "a", withRuns(saved, "fixed"));
    expect(after?.runs).toBe("workspace");
    expect(normalizeAction({ ...saved, runs: "fixed", cwd: "  " })).toBeNull();
  });

  it("is taken once it has its folder, trimmed", () => {
    const [after] = updateAction([saved], "a", withFixedCwd({ ...saved, runs: "fixed" }, " /srv "));
    expect(after).toMatchObject({ runs: "fixed", cwd: "/srv" });
  });

  it("drops the folder when the script moves to another place", () => {
    const fixed: Action = { ...saved, runs: "fixed", cwd: "/srv" };
    const [after] = updateAction([fixed], "a", withRuns(fixed, "folder"));
    expect(after).toMatchObject({ runs: "folder" });
    expect(after).not.toHaveProperty("cwd");
  });
});

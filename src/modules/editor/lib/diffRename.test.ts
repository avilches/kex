import { describe, expect, it } from "vitest";
import { diffRenameLabel } from "./diffRename";

describe("diffRenameLabel", () => {
  it("returns null when there is no rename", () => {
    expect(diffRenameLabel("src/a.ts", null)).toBeNull();
    expect(diffRenameLabel("src/a.ts", "src/a.ts")).toBeNull();
  });

  it("returns the old basename for a forward-slash rename", () => {
    expect(diffRenameLabel("src/new.ts", "src/old.ts")).toBe("old.ts");
  });

  it("returns the old basename for a backslash rename", () => {
    expect(diffRenameLabel("src\\new.ts", "src\\sub\\old.ts")).toBe("old.ts");
  });
});

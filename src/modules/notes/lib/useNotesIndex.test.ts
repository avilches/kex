import { describe, expect, it } from "vitest";
import { isNoteRelevantPath } from "./useNotesIndex";

describe("isNoteRelevantPath", () => {
  const root = "/vault";

  it("a plain note under the root schedules a refresh", () => {
    expect(isNoteRelevantPath(root, "/vault/a.md")).toBe(true);
  });

  it("uppercase and mixed-case extensions pass", () => {
    expect(isNoteRelevantPath(root, "/vault/A.MD")).toBe(true);
  });

  it("a directory with no extension passes", () => {
    expect(isNoteRelevantPath(root, "/vault/docs")).toBe(true);
  });

  it("a directory whose name contains a dot passes", () => {
    expect(isNoteRelevantPath(root, "/vault/docs/v1.2")).toBe(true);
  });

  it("a non-note file under the root passes too (deliberate trade-off)", () => {
    expect(isNoteRelevantPath(root, "/vault/notes.ts")).toBe(true);
  });

  it("the vault's own root kex.json is rejected", () => {
    expect(isNoteRelevantPath(root, "/vault/kex.json")).toBe(false);
  });

  it("a .tmp* sibling is rejected", () => {
    expect(isNoteRelevantPath(root, "/vault/.tmpABC123")).toBe(false);
  });

  it("a kex.json in a subdirectory is not rejected", () => {
    expect(isNoteRelevantPath(root, "/vault/docs/kex.json")).toBe(true);
  });

  it("a sibling root is rejected", () => {
    expect(isNoteRelevantPath("/repo", "/repo-backup/a.md")).toBe(false);
  });

  it("the root itself passes", () => {
    expect(isNoteRelevantPath(root, "/vault")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { suggestDuplicateName } from "@/modules/explorer/lib/duplicateName";

describe("suggestDuplicateName", () => {
  it("inserts ' copy' before the extension for files", () => {
    expect(suggestDuplicateName("pepe.txt", "file", [])).toBe("pepe copy.txt");
  });

  it("appends ' copy' for dirs", () => {
    expect(suggestDuplicateName("src", "dir", [])).toBe("src copy");
  });

  it("increments on collision for files", () => {
    expect(
      suggestDuplicateName("pepe.txt", "file", ["pepe.txt", "pepe copy.txt"]),
    ).toBe("pepe copy 2.txt");
  });

  it("increments on collision for dirs", () => {
    expect(suggestDuplicateName("src", "dir", ["src", "src copy"])).toBe(
      "src copy 2",
    );
  });

  it("treats dotfiles as having no extension", () => {
    expect(suggestDuplicateName(".gitignore", "file", [])).toBe(
      ".gitignore copy",
    );
  });

  it("handles multi-dot names by splitting on the last dot", () => {
    expect(suggestDuplicateName("a.tar.gz", "file", [])).toBe("a.tar copy.gz");
  });
});

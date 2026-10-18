import { describe, expect, it } from "vitest";
import { fileExtensions, fileIcons, fileNames, languageIds } from "./fileIcons";

// The three lookup maps are built by inverting `fileIcons` (last icon in
// object order wins), so a key listed under two icons is silently resolved
// instead of failing loudly. These tests keep the data collision-free and pin
// the winner for the keys that used to be shadowed.
const FIELDS = ["fileExtensions", "fileNames", "languageIds"] as const;

function crossIconCollisions(): string[] {
  const out: string[] = [];
  for (const field of FIELDS) {
    const seen = new Map<string, string>();
    for (const [name, icon] of Object.entries(fileIcons)) {
      for (const key of icon[field] ?? []) {
        const prev = seen.get(key);
        if (prev !== undefined && prev !== name) {
          out.push(`${field} "${key}": ${prev} vs ${name}`);
        }
        seen.set(key, name);
      }
    }
  }
  return out;
}

function withinIconDuplicates(): string[] {
  const out: string[] = [];
  for (const [name, icon] of Object.entries(fileIcons)) {
    for (const field of FIELDS) {
      const seen = new Set<string>();
      for (const key of icon[field] ?? []) {
        if (seen.has(key)) out.push(`${name}.${field} repeats "${key}"`);
        seen.add(key);
      }
    }
  }
  return out;
}

describe("fileIcons", () => {
  it("has no key listed under two different icons", () => {
    expect(crossIconCollisions()).toEqual([]);
  });

  it("has no key repeated inside the same icon", () => {
    expect(withinIconDuplicates()).toEqual([]);
  });

  it("resolves the keys that used to be shadowed to the intended icon", () => {
    expect(fileExtensions.db).toBe("database");
    expect(fileExtensions.sc).toBe("scala");
    expect(fileExtensions.psb).toBe("adobe-ps");
    expect(fileNames[".luacheckrc"]).toBe("lua-check");
    expect(fileNames[".lintstagedrc"]).toBe("lint-staged");
    expect(languageIds.lua).toBe("lua");
  });
});

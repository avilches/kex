import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACCEPTS, EDITOR_CATALOG, getEditorAccepts } from "./catalog";

describe("editor catalog", () => {
  it("lists the same apps as the Rust scan, so a detected app is never unknown here", () => {
    const rust = readFileSync("src-tauri/src/modules/editors/catalog.rs", "utf8");
    const ids = [...rust.matchAll(/^\s+id: "([^"]+)"/gm)].map((m) => m[1]).sort();
    expect(EDITOR_CATALOG.map((e) => e.id).sort()).toEqual(ids);
  });

  it("derives what an app accepts from its group: JetBrains folders, the rest either", () => {
    expect(getEditorAccepts("pycharm")).toBe("folder");
    expect(getEditorAccepts("android-studio-canary")).toBe("folder");
    expect(getEditorAccepts("zed")).toBe("both");
    expect(getEditorAccepts("vscode")).toBe("both");
    expect(getEditorAccepts("xcode")).toBe("both");
  });

  it("gives an app it does not know the one default", () => {
    expect(getEditorAccepts("mystery")).toBe(DEFAULT_ACCEPTS);
    expect(DEFAULT_ACCEPTS).toBe("folder");
  });
});

import { describe, expect, it } from "vitest";
import { SETTINGS_SECTIONS } from "./sections";

describe("SETTINGS_SECTIONS", () => {
  it("lists the ten sections once each, in window order", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([
      "general",
      "workspaces",
      "terminal",
      "external-editors",
      "editor",
      "filetypes",
      "appearance",
      "themes",
      "shortcuts",
      "about",
    ]);
  });

  it("labels external-editors as Tools", () => {
    expect(SETTINGS_SECTIONS.find((s) => s.id === "external-editors")?.label).toBe("Tools");
  });
});

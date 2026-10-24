import { describe, expect, it } from "vitest";
import { SETTINGS_SECTIONS } from "./sections";

describe("SETTINGS_SECTIONS", () => {
  it("lists the ten sections once each, in window order", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([
      "general",
      "workspaces",
      "terminal",
      "agents",
      "actions",
      "editor",
      "appearance",
      "themes",
      "shortcuts",
      "about",
    ]);
  });

  it("labels actions as Actions", () => {
    expect(SETTINGS_SECTIONS.find((s) => s.id === "actions")?.label).toBe("Actions");
  });
});

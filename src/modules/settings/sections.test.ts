import { describe, expect, it } from "vitest";
import { SETTINGS_SECTIONS } from "./sections";

describe("SETTINGS_SECTIONS", () => {
  it("lists the eleven sections once each, in window order", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([
      "general",
      "workspaces",
      "terminal",
      "agents",
      "permissions",
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

  it("permissions is the only macOnly section", () => {
    expect(SETTINGS_SECTIONS.filter((s) => s.macOnly).map((s) => s.id)).toEqual(["permissions"]);
  });
});

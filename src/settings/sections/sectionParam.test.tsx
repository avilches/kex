import { describe, expect, it } from "vitest";

const { parseSectionParam } = await import("../SettingsApp");

describe("parseSectionParam", () => {
  it("keeps the whole extra, including the :script tail of the actions section", () => {
    expect(parseSectionParam("actions:workspace:script")).toEqual({ section: "actions", ext: "workspace:script" });
    expect(parseSectionParam("actions:script")).toEqual({ section: "actions", ext: "script" });
    expect(parseSectionParam("actions:workspace")).toEqual({ section: "actions", ext: "workspace" });
    expect(parseSectionParam("appearance:titles")).toEqual({ section: "appearance", ext: "titles" });
    expect(parseSectionParam("unknown:junk")).toEqual({ section: "general", ext: "junk" });
    expect(parseSectionParam(null)).toEqual({ section: "general" });
    expect(parseSectionParam("actions")).toEqual({ section: "actions" });
    expect(parseSectionParam("shortcuts:Scratchpad")).toEqual({ section: "shortcuts", ext: "Scratchpad" });
  });
});

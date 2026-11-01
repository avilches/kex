import { describe, expect, it } from "vitest";
import { acceptsFromSwitches, appCombos } from "./actionTargets";

describe("acceptsFromSwitches", () => {
  it("joins the two switches into one value", () => {
    expect(acceptsFromSwitches(true, true, "folder")).toBe("both");
    expect(acceptsFromSwitches(true, false, "both")).toBe("file");
    expect(acceptsFromSwitches(false, true, "both")).toBe("folder");
  });

  it("keeps the current value when both go off, so an app always opens something", () => {
    expect(acceptsFromSwitches(false, false, "folder")).toBe("folder");
    expect(acceptsFromSwitches(false, false, "file")).toBe("file");
  });
});

describe("appCombos", () => {
  it("puts an app that opens folders in the Actions menu and one that edits files in the File combo", () => {
    expect(appCombos("folder")).toEqual({ actions: true, file: false });
    expect(appCombos("file")).toEqual({ actions: false, file: true });
    expect(appCombos("both")).toEqual({ actions: true, file: true });
  });
});

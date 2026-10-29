import { describe, expect, it } from "vitest";
import { uiFontLabel } from "./uiFonts";

describe("uiFontLabel", () => {
  it("names the default font", () => {
    expect(uiFontLabel("")).toBe("Inter");
  });

  it("drops the parenthetical hint of a preset", () => {
    expect(uiFontLabel("Georgia, serif")).toBe("Georgia");
    expect(uiFontLabel("-apple-system, BlinkMacSystemFont")).toBe("SF Pro");
  });

  it("keeps the label of a plain preset", () => {
    expect(uiFontLabel("DM Sans Variable")).toBe("DM Sans");
  });

  it("uses the first family of a custom value, unquoted", () => {
    expect(uiFontLabel('"Fira Sans", sans-serif')).toBe("Fira Sans");
  });
});

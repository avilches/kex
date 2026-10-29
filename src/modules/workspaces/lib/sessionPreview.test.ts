import { describe, expect, it } from "vitest";
import {
  previewRequestKey,
  tildePath,
} from "./sessionPreview";

const HOME = "/Users/me";

describe("tildePath", () => {
  it("abbreviates the home folder and nothing that only shares its prefix", () => {
    expect(tildePath("/Users/me/code/kex", HOME)).toBe("~/code/kex");
    expect(tildePath("/Users/me", HOME)).toBe("~");
    expect(tildePath("/Users/meta/x", HOME)).toBe("/Users/meta/x");
    expect(tildePath("C:\\Users\\me\\x", "C:/Users/me")).toBe("~/x");
    expect(tildePath("/tmp", null)).toBe("/tmp");
  });
});

describe("previewRequestKey", () => {
  it("does not change with the order of the tabs", () => {
    expect(previewRequestKey(["b", "a"])).toBe(previewRequestKey(["a", "b"]));
    expect(previewRequestKey([])).toBe("");
  });
});

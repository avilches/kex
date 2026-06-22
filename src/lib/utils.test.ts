import { describe, expect, it } from "vitest";
import { shouldWrapByDefault } from "./utils";

describe("shouldWrapByDefault", () => {
  it("wraps prose file types", () => {
    for (const p of ["notes.md", "a.markdown", "x.mdx", "log.txt", "READ.text", "DIR/Deep.MD"]) {
      expect(shouldWrapByDefault(p)).toBe(true);
    }
  });
  it("does not wrap code or data file types", () => {
    for (const p of ["main.ts", "app.tsx", "data.json", "run.log", "Cargo.toml", "noext"]) {
      expect(shouldWrapByDefault(p)).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import { typedLine } from "./typedLine";

describe("typedLine", () => {
  it("is the command and a carriage return, with no leading space", () => {
    expect(typedLine("claude --resume 'abc'")).toBe("claude --resume 'abc'\r");
    expect(typedLine("pnpm dev")).toBe("pnpm dev\r");
  });
});

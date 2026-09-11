import { describe, expect, it } from "vitest";
import { hasMermaidFence } from "@/modules/markdown/milkdown/mermaidFence";

describe("hasMermaidFence", () => {
  it("detects a mermaid fence", () => {
    expect(hasMermaidFence("text\n```mermaid\ngraph TD;\n```\n")).toBe(true);
  });

  it("ignores other fences and inline mentions", () => {
    expect(hasMermaidFence("```ts\nconst mermaid = 1;\n```\n")).toBe(false);
    expect(hasMermaidFence("the word mermaid\n")).toBe(false);
  });

  it("detects tilde fences and info-string padding", () => {
    expect(hasMermaidFence("~~~ mermaid\ngraph TD;\n~~~\n")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { sealMarkdownEngine } from "@/modules/markdown/lib/sealMarkdownEngine";
import type { Tab } from "@/modules/workspaces/lib/types";

const markdownTab: Tab = { id: "t1", kind: "markdown", path: "/notes/a.md" };
const editorTab: Tab = { id: "t2", kind: "editor", path: "/notes/a.md", dirty: false, preview: false };
const codeTab: Tab = { id: "t3", kind: "editor", path: "/src/main.ts", dirty: false, preview: false };
const terminalTab: Tab = { id: "t4", kind: "terminal" };

describe("sealMarkdownEngine", () => {
  it("stamps a markdown tab with the engine", () => {
    expect(sealMarkdownEngine(markdownTab, "milkdown")).toMatchObject({
      kind: "markdown",
      markdownEngine: "milkdown",
    });
  });

  it("stamps an editor tab whose path is markdown", () => {
    expect(sealMarkdownEngine(editorTab, "tiptap")).toMatchObject({
      markdownEngine: "tiptap",
    });
  });

  it("leaves a non-markdown editor tab untouched", () => {
    expect(sealMarkdownEngine(codeTab, "milkdown")).toBe(codeTab);
  });

  it("leaves other tab kinds untouched", () => {
    expect(sealMarkdownEngine(terminalTab, "milkdown")).toBe(terminalTab);
  });

  it("never overwrites an engine the tab already carries", () => {
    const explicit: Tab = { ...markdownTab, markdownEngine: "legacy" };
    expect(sealMarkdownEngine(explicit, "milkdown")).toBe(explicit);
  });
});

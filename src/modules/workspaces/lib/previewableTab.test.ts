import { describe, expect, it } from "vitest";
import { isPreviewableEditorTab } from "@/modules/workspaces/lib/previewableTab";
import type { Tab } from "@/modules/workspaces/lib/types";

const editor = (path: string) => ({ id: "tab-1", kind: "editor", path, title: "t", dirty: false }) as Tab;

describe("isPreviewableEditorTab", () => {
  it("accepts an editor tab over a markdown or html file", () => {
    expect(isPreviewableEditorTab(editor("/a/b.md"))).toBe(true);
    expect(isPreviewableEditorTab(editor("/a/b.html"))).toBe(true);
  });

  it("rejects an editor tab over any other file", () => {
    expect(isPreviewableEditorTab(editor("/a/b.ts"))).toBe(false);
  });

  it("rejects other tab kinds and a missing tab", () => {
    const markdown = { id: "tab-2", kind: "markdown", path: "/a/b.md", title: "t" } as Tab;
    expect(isPreviewableEditorTab(markdown)).toBe(false);
    expect(isPreviewableEditorTab(undefined)).toBe(false);
    expect(isPreviewableEditorTab(null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  findReplaceableFilePreview,
  isFilePreviewTab,
} from "@/modules/workspaces/lib/fileTabPreview";
import type { Tab } from "@/modules/workspaces/lib/types";

const editor = (id: string, preview: boolean, locked?: boolean): Tab => ({
  id,
  kind: "editor",
  path: `/x/${id}.ts`,
  dirty: false,
  preview,
  locked,
});
const markdown = (id: string, preview?: boolean): Tab => ({
  id,
  kind: "markdown",
  path: `/x/${id}.md`,
  preview,
});

describe("isFilePreviewTab", () => {
  it("is true for editor and markdown tabs flagged as preview", () => {
    expect(isFilePreviewTab(editor("a", true))).toBe(true);
    expect(isFilePreviewTab(markdown("b", true))).toBe(true);
  });

  it("is false when the flag is off or absent", () => {
    expect(isFilePreviewTab(editor("a", false))).toBe(false);
    expect(isFilePreviewTab(markdown("b"))).toBe(false);
  });
});

describe("findReplaceableFilePreview", () => {
  it("returns a markdown preview so a code file replaces it, and the reverse", () => {
    expect(findReplaceableFilePreview([editor("a", false), markdown("b", true)])?.id).toBe("b");
    expect(findReplaceableFilePreview([markdown("b", false), editor("a", true)])?.id).toBe("a");
  });

  it("skips a locked preview and returns undefined when none is left", () => {
    expect(findReplaceableFilePreview([editor("a", true, true)])).toBeUndefined();
    expect(findReplaceableFilePreview([])).toBeUndefined();
  });
});

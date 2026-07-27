import { describe, expect, it } from "vitest";
import { MarkdownDocumentBuffer } from "@/modules/markdown/lib/documentBuffer";

describe("MarkdownDocumentBuffer", () => {
  const raw = "---\ntitle: T\n---\n# Body\n";

  it("splits frontmatter and exposes only the body", () => {
    const buf = new MarkdownDocumentBuffer(raw);
    expect(buf.frontmatter).toBe("---\ntitle: T\n---\n");
    expect(buf.getBody()).toBe("# Body\n");
    expect(buf.isDirty()).toBe(false);
  });

  it("skip-if-equal: no save content when the body did not change", () => {
    const buf = new MarkdownDocumentBuffer(raw);
    buf.setBody("# Body\n");
    expect(buf.isDirty()).toBe(false);
    expect(buf.contentToSave()).toBeNull();
  });

  it("re-prepends frontmatter verbatim on save", () => {
    const buf = new MarkdownDocumentBuffer(raw);
    buf.setBody("# Edited\n");
    expect(buf.isDirty()).toBe(true);
    expect(buf.contentToSave()).toBe("---\ntitle: T\n---\n# Edited\n");
    buf.markSaved();
    expect(buf.isDirty()).toBe(false);
    expect(buf.contentToSave()).toBeNull();
  });

  it("replaceFromDisk returns false for self-write echoes", () => {
    const buf = new MarkdownDocumentBuffer(raw);
    expect(buf.replaceFromDisk(raw)).toBe(false);
    expect(buf.replaceFromDisk("---\ntitle: T\n---\n# New\n")).toBe(true);
    expect(buf.getBody()).toBe("# New\n");
    expect(buf.isDirty()).toBe(false);
  });
});

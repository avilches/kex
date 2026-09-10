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

  it("treats the load-time serialization as unmodified, however it was reformatted", () => {
    // The round trip reflows a hand-wrapped paragraph into one line. That is not an edit.
    const wrapped = "una linea\nseguida de otra\n";
    const buf = new MarkdownDocumentBuffer(wrapped);
    const normalized = "una linea seguida de otra\n";
    buf.setBaseline(normalized);
    buf.setBody(normalized);
    expect(buf.isDirty()).toBe(false);
    expect(buf.contentToSave()).toBeNull();
  });

  it("still reports a real edit made on top of the reformatted text", () => {
    const buf = new MarkdownDocumentBuffer("una linea\nseguida de otra\n");
    buf.setBaseline("una linea seguida de otra\n");
    buf.setBody("una linea seguida de otra, y algo mas\n");
    expect(buf.isDirty()).toBe(true);
    expect(buf.contentToSave()).toBe("una linea seguida de otra, y algo mas\n");
  });

  it("drops the baseline once saved, so an undo back to the loaded form is saveable", () => {
    const buf = new MarkdownDocumentBuffer("una linea\nseguida de otra\n");
    const normalized = "una linea seguida de otra\n";
    buf.setBaseline(normalized);
    buf.setBody("editado\n");
    buf.markSaved();
    buf.setBody(normalized);
    expect(buf.isDirty()).toBe(true);
    expect(buf.contentToSave()).toBe(normalized);
  });

  it("drops the baseline when the file is replaced from disk", () => {
    const buf = new MarkdownDocumentBuffer(raw);
    buf.setBaseline("# Baseline\n");
    expect(buf.replaceFromDisk("---\ntitle: T\n---\n# New\n")).toBe(true);
    buf.setBody("# Baseline\n");
    expect(buf.isDirty()).toBe(true);
  });

  it("replaceFromDisk returns false for self-write echoes", () => {
    const buf = new MarkdownDocumentBuffer(raw);
    expect(buf.replaceFromDisk(raw)).toBe(false);
    expect(buf.replaceFromDisk("---\ntitle: T\n---\n# New\n")).toBe(true);
    expect(buf.getBody()).toBe("# New\n");
    expect(buf.isDirty()).toBe(false);
  });
});

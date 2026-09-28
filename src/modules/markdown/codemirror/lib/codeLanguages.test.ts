import { LanguageSupport } from "@codemirror/language";
import { describe, expect, it } from "vitest";
import { codeLanguages } from "@/modules/markdown/codemirror/lib/codeLanguages";

describe("codeLanguages", () => {
  it("resolves a fence tag by language name or by file extension, case-insensitively", () => {
    expect(codeLanguages("javascript")?.name).toBe("JavaScript");
    expect(codeLanguages("JavaScript")?.name).toBe("JavaScript");
    expect(codeLanguages("js")?.name).toBe("JavaScript");
    expect(codeLanguages("ts")?.name).toBe("TypeScript");
    expect(codeLanguages("py")?.name).toBe("Python");
    expect(codeLanguages("bash")?.name).toBe("Shell");
    expect(codeLanguages("yml")?.name).toBe("YAML");
  });

  it("returns null for an unknown tag or no tag, without fuzzy matching", () => {
    expect(codeLanguages("")).toBeNull();
    expect(codeLanguages("not-a-language")).toBeNull();
    expect(codeLanguages("csharp")).toBeNull();
  });

  it("loads a LanguageSupport for both parser-backed and stream-backed languages", async () => {
    const parserBacked = await codeLanguages("js")?.load();
    const streamBacked = await codeLanguages("sh")?.load();
    expect(parserBacked).toBeInstanceOf(LanguageSupport);
    expect(streamBacked).toBeInstanceOf(LanguageSupport);
  });
});

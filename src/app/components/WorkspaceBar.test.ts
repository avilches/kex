import { describe, expect, test } from "vitest";

// Copy the pure functions here to test them in isolation
function abbrev(title: string, kind: string): string {
  const text = title.trim() || kind;
  const words = text.split(/[\s\-_/]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

function idHue(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return (h >>> 0) % 360;
}

describe("WorkspaceBar helpers", () => {
  describe("abbrev", () => {
    test("two-word title gives initials", () => {
      expect(abbrev("my-repo", "terminal")).toBe("MR");
    });
    test("single word gives first 2 chars uppercased", () => {
      expect(abbrev("api", "terminal")).toBe("AP");
    });
    test("empty title falls back to kind", () => {
      expect(abbrev("", "terminal")).toBe("TE");
    });
    test("slash-separated path gives initials", () => {
      expect(abbrev("projects/foo", "terminal")).toBe("PF");
    });
  });

  describe("idHue", () => {
    test("returns a number in 0-359", () => {
      const hue = idHue(crypto.randomUUID());
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    });
    test("same ID always gives same hue", () => {
      const id = "abc-123-fixed";
      expect(idHue(id)).toBe(idHue(id));
    });
    test("different IDs typically give different hues", () => {
      const hues = new Set(
        Array.from({ length: 20 }, () => idHue(crypto.randomUUID()))
      );
      expect(hues.size).toBeGreaterThan(10);
    });
  });
});

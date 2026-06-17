import { describe, expect, it } from "vitest";
import { fuzzyBest, fuzzyBestLower, fuzzyScore, fuzzyScoreLower } from "./fuzzy";

function score(query: string, target: string): number {
  const s = fuzzyScore(query, target);
  expect(s).not.toBeNull();
  return s ?? Number.NaN;
}

describe("fuzzyScore", () => {
  it("returns 0 for an empty query", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("returns null when not a subsequence", () => {
    expect(fuzzyScore("xyz", "split pane")).toBeNull();
    expect(fuzzyScore("longer", "abc")).toBeNull();
  });

  it("matches non-contiguous subsequences", () => {
    expect(fuzzyScore("splr", "split pane right")).not.toBeNull();
  });

  it("scores word-boundary matches above mid-word matches", () => {
    expect(score("np", "new private")).toBeGreaterThan(score("np", "unzip"));
  });

  it("rewards consecutive runs over scattered matches", () => {
    expect(score("set", "settings")).toBeGreaterThan(
      score("set", "split editor tab"),
    );
  });
});

describe("fuzzyBest", () => {
  it("takes the highest-scoring candidate", () => {
    const score = fuzzyBest("ai", ["close tab", "toggle ai agent"]);
    expect(score).not.toBeNull();
  });

  it("returns null when no candidate matches", () => {
    expect(fuzzyBest("zzz", ["one", "two"])).toBeNull();
  });
});

describe("fuzzyScoreLower", () => {
  it("returns 0 for an empty query", () => {
    expect(fuzzyScoreLower("", "anything")).toBe(0);
  });

  it("returns null when not a subsequence", () => {
    expect(fuzzyScoreLower("xyz", "split pane")).toBeNull();
    expect(fuzzyScoreLower("longer", "abc")).toBeNull();
  });

  it("matches non-contiguous subsequences", () => {
    expect(fuzzyScoreLower("splr", "split pane right")).not.toBeNull();
  });

  it("matches the same subsequences as fuzzyScore", () => {
    const pairs: [string, string][] = [
      ["set", "settings"],
      ["np", "new private"],
      ["ai", "toggle ai agent"],
      ["splr", "split pane right"],
    ];
    for (const [q, t] of pairs) {
      const lower = fuzzyScoreLower(q, t);
      const normal = fuzzyScore(q, t);
      // Both functions agree on match/no-match; scores differ because
      // fuzzyScore adds BONUS_EXACT_CASE per matched char while the lower
      // variant omits it (both sides are already lowercase).
      expect(lower === null).toBe(normal === null);
      if (lower !== null && normal !== null) {
        expect(lower).toBeLessThan(normal);
      }
    }
  });

  it("scores word-boundary matches above mid-word matches", () => {
    const boundaryScore = fuzzyScoreLower("np", "new private");
    const midWordScore = fuzzyScoreLower("np", "unzip");
    expect(boundaryScore).not.toBeNull();
    expect(midWordScore).not.toBeNull();
    expect(boundaryScore!).toBeGreaterThan(midWordScore!);
  });

  it("rewards consecutive runs over scattered matches", () => {
    const consecutive = fuzzyScoreLower("set", "settings");
    const scattered = fuzzyScoreLower("set", "split editor tab");
    expect(consecutive).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(consecutive!).toBeGreaterThan(scattered!);
  });
});

describe("fuzzyBestLower", () => {
  it("takes the highest-scoring candidate", () => {
    const s = fuzzyBestLower("ai", ["close tab", "toggle ai agent"]);
    expect(s).not.toBeNull();
  });

  it("returns null when no candidate matches", () => {
    expect(fuzzyBestLower("zzz", ["one", "two"])).toBeNull();
  });

  it("returns 0 for empty query", () => {
    expect(fuzzyBestLower("", ["anything"])).toBe(0);
  });
});

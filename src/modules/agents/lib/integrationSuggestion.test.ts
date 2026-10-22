import { describe, expect, it } from "vitest";
import {
  parseSuggestions,
  SUGGESTION_RETRY_MS,
  shouldSuggest,
  withAsked,
  withInstalled,
} from "./integrationSuggestion";

const T0 = 1_700_000_000_000;

describe("shouldSuggest", () => {
  it("asks the first time", () => {
    expect(shouldSuggest(undefined, T0)).toBe(true);
  });

  it("does not ask again right after the first ask", () => {
    const map = withAsked({}, "claude", T0);
    expect(shouldSuggest(map.claude, T0 + 1000)).toBe(false);
    expect(shouldSuggest(map.claude, T0 + SUGGESTION_RETRY_MS - 1)).toBe(false);
  });

  it("asks once more after 15 days", () => {
    const map = withAsked({}, "claude", T0);
    expect(shouldSuggest(map.claude, T0 + SUGGESTION_RETRY_MS)).toBe(true);
  });

  it("never asks a third time", () => {
    let map = withAsked({}, "pi", T0);
    map = withAsked(map, "pi", T0 + SUGGESTION_RETRY_MS);
    expect(shouldSuggest(map.pi, T0 + SUGGESTION_RETRY_MS * 10)).toBe(false);
  });

  it("never asks again once the integration was installed, even if removed later", () => {
    const map = withInstalled({}, "omp");
    expect(shouldSuggest(map.omp, T0)).toBe(false);
    expect(shouldSuggest(map.omp, T0 + SUGGESTION_RETRY_MS * 10)).toBe(false);
  });

  it("keeps the ask history when installing after a suggestion", () => {
    const map = withInstalled(withAsked({}, "opencode", T0), "opencode");
    expect(map.opencode).toEqual({ asks: 1, lastAskedAt: T0, installedOnce: true });
  });

  it("treats each agent on its own", () => {
    const map = withAsked({}, "claude", T0);
    expect(shouldSuggest(map.opencode, T0)).toBe(true);
  });

  it("stays silent for an asked-once record with no date", () => {
    expect(shouldSuggest({ asks: 1, lastAskedAt: null, installedOnce: false }, T0)).toBe(false);
  });
});

describe("parseSuggestions", () => {
  it("keeps well-formed entries of known agents", () => {
    expect(
      parseSuggestions({
        claude: { asks: 1, lastAskedAt: T0, installedOnce: false },
        gemini: { asks: 1, lastAskedAt: T0, installedOnce: true },
      }),
    ).toEqual({ claude: { asks: 1, lastAskedAt: T0, installedOnce: false } });
  });

  it("repairs bad fields and rejects non-objects", () => {
    expect(parseSuggestions({ pi: { asks: "x", lastAskedAt: "y", installedOnce: 1 } })).toEqual({
      pi: { asks: 0, lastAskedAt: null, installedOnce: false },
    });
    expect(parseSuggestions(null)).toEqual({});
    expect(parseSuggestions([1])).toEqual({});
    expect(parseSuggestions("claude")).toEqual({});
  });
});

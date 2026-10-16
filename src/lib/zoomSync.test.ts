import { describe, expect, it } from "vitest";
import { applyZoomThenRefit } from "@/lib/zoomSync";

describe("applyZoomThenRefit", () => {
  it("applies the zoom to the DOM before refitting terminals", () => {
    const calls: string[] = [];
    applyZoomThenRefit(1.1, true, {
      applyZoomToDom: (z) => calls.push(`zoom:${z}`),
      refitTerminals: () => calls.push("refit"),
    });
    expect(calls).toEqual(["zoom:1.1", "refit"]);
  });

  it("still refits but leaves the DOM alone before preferences hydrate", () => {
    const calls: string[] = [];
    applyZoomThenRefit(1.1, false, {
      applyZoomToDom: (z) => calls.push(`zoom:${z}`),
      refitTerminals: () => calls.push("refit"),
    });
    expect(calls).toEqual(["refit"]);
  });
});

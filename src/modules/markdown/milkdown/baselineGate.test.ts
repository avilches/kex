import { describe, expect, it } from "vitest";
import { shouldRegisterMilkdownBaseline } from "@/modules/markdown/milkdown/baselineGate";

describe("shouldRegisterMilkdownBaseline", () => {
  it("is false before the editor reports ready", () => {
    expect(
      shouldRegisterMilkdownBaseline({ mode: "rich", readyRevision: 0, editorReady: false }),
    ).toBe(false);
  });

  it("is true once ready, in rich mode, with a loaded revision", () => {
    expect(
      shouldRegisterMilkdownBaseline({ mode: "rich", readyRevision: 0, editorReady: true }),
    ).toBe(true);
  });

  it("is false in source mode even if the editor was previously ready", () => {
    expect(
      shouldRegisterMilkdownBaseline({ mode: "source", readyRevision: 0, editorReady: true }),
    ).toBe(false);
  });

  it("is false while the document has not finished loading", () => {
    expect(
      shouldRegisterMilkdownBaseline({ mode: "rich", readyRevision: null, editorReady: true }),
    ).toBe(false);
  });

  it("is false again right after a revision bump resets readiness", () => {
    expect(
      shouldRegisterMilkdownBaseline({ mode: "rich", readyRevision: 1, editorReady: false }),
    ).toBe(false);
  });
});

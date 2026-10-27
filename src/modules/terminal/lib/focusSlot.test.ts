// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { paletteFocusGate } from "@/modules/workspaces/lib/focusGate";
import { focusSlotOf } from "./rendererPool";

afterEach(() => paletteFocusGate.release());

function fakeSlot(leafId: string) {
  const textarea = document.createElement("textarea");
  document.body.append(textarea);
  return { currentLeafId: leafId, term: { focus: () => textarea.focus() } as never, textarea };
}

describe("focusSlotOf", () => {
  it("leaves the keyboard in the palette input while the gate is held, as when a terminal becomes visible and focused", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    const slot = fakeSlot("t1");
    paletteFocusGate.hold();
    focusSlotOf([slot], "t1");
    expect(document.activeElement).toBe(input);
    paletteFocusGate.release();
    focusSlotOf([slot], "t1");
    expect(document.activeElement).toBe(slot.textarea);
  });
});

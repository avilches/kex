import { describe, expect, it } from "vitest";
import { sendPlaceholder } from "./scratchpadHints";

const MAC = { enter: "⏎", shiftEnter: "⇧⏎" };

describe("sendPlaceholder", () => {
  it("names the key that sends first when Enter sends", () => {
    expect(sendPlaceholder(true, MAC)).toBe("⏎ sends. ⇧⏎ new line");
  });

  it("swaps the keys when Shift+Enter sends", () => {
    expect(sendPlaceholder(false, MAC)).toBe("⇧⏎ sends. ⏎ new line");
  });
});

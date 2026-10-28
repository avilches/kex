import { describe, expect, it } from "vitest";
import { PALETTE_INPUT_SELECTOR } from "@/modules/command-palette/lib/keepPaletteFocus";
import { PALETTE_INPUT_ATTR } from "./rendererPool";

describe("focusSlot under the command palette", () => {
  it("uses the selector of the palette input, so a terminal waking under it leaves the focus alone", () => {
    expect(PALETTE_INPUT_ATTR).toBe(PALETTE_INPUT_SELECTOR);
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { PALETTE_INPUT_SELECTOR } from "@/modules/command-palette/lib/keepPaletteFocus";
import { OPEN_PALETTE_INPUT, paletteHoldsFocus } from "./paletteHoldsFocus";

afterEach(() => {
  document.body.innerHTML = "";
});

function mountPalette(state: "open" | "closed") {
  document.body.innerHTML = `
    <div data-slot="dialog-content" data-state="${state}">
      <input cmdk-input="" data-palette="command" />
    </div>`;
}

describe("paletteHoldsFocus", () => {
  it("is false with no palette", () => {
    expect(paletteHoldsFocus()).toBe(false);
  });

  it("is true while the palette is open", () => {
    mountPalette("open");
    expect(paletteHoldsFocus()).toBe(true);
  });

  it("is false while the palette plays its exit animation, so the terminal woken under it gets the focus Escape asked for", () => {
    mountPalette("closed");
    expect(document.querySelector(PALETTE_INPUT_SELECTOR)).not.toBeNull();
    expect(paletteHoldsFocus()).toBe(false);
  });

  it("ignores an input of another palette", () => {
    document.body.innerHTML = `
      <div data-slot="dialog-content" data-state="open"><input cmdk-input="" data-palette="folder" /></div>`;
    expect(paletteHoldsFocus()).toBe(false);
  });

  it("targets the same input as the palette's own selector", () => {
    expect(OPEN_PALETTE_INPUT.endsWith(PALETTE_INPUT_SELECTOR)).toBe(true);
  });
});

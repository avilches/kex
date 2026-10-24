import { describe, expect, it, vi } from "vitest";
import { keepInputFocus } from "./RowMenu";

const mouseDown = (button: number, insideMenu: boolean) => {
  const preventDefault = vi.fn();
  const target = { closest: (sel: string) => (insideMenu && sel === "[data-row-menu]" ? {} : null) };
  keepInputFocus({ button, target, preventDefault } as never);
  return preventDefault;
};

describe("keepInputFocus", () => {
  it("cancels the focus change of a right click so the input keeps the focus", () => {
    expect(mouseDown(2, false)).toHaveBeenCalled();
  });

  it("cancels it for a click inside the row menu", () => {
    expect(mouseDown(0, true)).toHaveBeenCalled();
  });

  it("leaves a plain left click alone", () => {
    expect(mouseDown(0, false)).not.toHaveBeenCalled();
  });
});

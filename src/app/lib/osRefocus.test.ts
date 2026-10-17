// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { domFocusHoldsOsRefocus } from "./osRefocus";

function el(html: string, attrs: Record<string, string> = {}): HTMLElement {
  const parent = document.createElement("div");
  parent.innerHTML = html;
  const first = parent.firstElementChild as HTMLElement;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "isContentEditable") first.contentEditable = v;
    else first.setAttribute(k, v);
  }
  return first;
}

describe("domFocusHoldsOsRefocus", () => {
  test("a rename input keeps the focus when the window regains it", () => {
    expect(domFocusHoldsOsRefocus(el("<input>"))).toBe(true);
    expect(domFocusHoldsOsRefocus(el("<textarea>"))).toBe(true);
    const editable = el("<div>");
    editable.contentEditable = "true";
    expect(domFocusHoldsOsRefocus(editable)).toBe(true);
  });

  test("the terminal and a plain body never hold it", () => {
    expect(domFocusHoldsOsRefocus(el('<textarea class="xterm-helper-textarea">'))).toBe(false);
    expect(domFocusHoldsOsRefocus(el("<div>"))).toBe(false);
    expect(domFocusHoldsOsRefocus(null)).toBe(false);
  });
});

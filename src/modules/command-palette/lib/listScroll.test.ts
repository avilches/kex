// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { listViewportOf, scrollListToTop } from "./listScroll";

function list(scrollTop: number): HTMLElement {
  const root = document.createElement("div");
  const viewport = document.createElement("div");
  viewport.setAttribute("data-slot", "scroll-area-viewport");
  viewport.scrollTop = scrollTop;
  root.append(viewport);
  return root;
}

describe("scrollListToTop", () => {
  it("puts a scrolled viewport back at the top", () => {
    const root = list(240);
    expect(listViewportOf(root)?.scrollTop).toBe(240);
    scrollListToTop(root);
    expect(listViewportOf(root)?.scrollTop).toBe(0);
  });

  it("does nothing without a list", () => {
    expect(() => scrollListToTop(null)).not.toThrow();
    expect(() => scrollListToTop(document.createElement("div"))).not.toThrow();
  });
});

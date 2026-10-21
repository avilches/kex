// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { takeCensus } from "./domCensus";

function terminal(renderer: "dom" | "webgl", rows = 3): string {
  const inner =
    renderer === "dom"
      ? `<div class="xterm-rows">${"<div></div>".repeat(rows)}</div>`
      : "<canvas></canvas>";
  return `<div class="xterm"><div class="xterm-screen">${inner}</div></div>`;
}

describe("takeCensus", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("counts terminals by renderer and the rows the DOM renderer keeps", () => {
    document.body.innerHTML = terminal("dom", 4) + terminal("dom", 2) + terminal("webgl");
    const c = takeCensus(document);
    expect(c.xterms).toBe(3);
    expect(c.domRendererTerminals).toBe(2);
    expect(c.webglTerminals).toBe(1);
    expect(c.domRows).toBe(6);
  });

  it("ignores idle slots parked in the recycler", () => {
    document.body.innerHTML = `${terminal("dom", 5)}<div data-kex-recycler>${terminal("dom", 5)}${terminal("webgl")}</div>`;
    const c = takeCensus(document);
    expect(c.xterms).toBe(1);
    expect(c.domRendererTerminals).toBe(1);
    expect(c.webglTerminals).toBe(0);
    expect(c.domRows).toBe(5);
  });

  it("counts every element as DOM nodes", () => {
    document.body.innerHTML = "<div><span></span><span></span></div>";
    expect(takeCensus(document).nodes).toBe(document.querySelectorAll("*").length);
  });
});

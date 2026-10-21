import type { Census } from "./rafStats";

// Idle slots wait in the recycler with a DOM renderer of their own; only terminals bound to a tab count.
function bound(root: ParentNode, selector: string): Element[] {
  return [...root.querySelectorAll(selector)].filter((el) => !el.closest("[data-kex-recycler]"));
}

export function takeCensus(root: ParentNode): Census {
  const rows = bound(root, ".xterm-rows");
  const webgl = new Set(
    bound(root, ".xterm-screen canvas").map((canvas) => canvas.closest(".xterm-screen")),
  );
  return {
    nodes: root.querySelectorAll("*").length,
    xterms: bound(root, ".xterm").length,
    domRendererTerminals: rows.length,
    webglTerminals: webgl.size,
    domRows: rows.reduce((sum, el) => sum + el.childElementCount, 0),
  };
}

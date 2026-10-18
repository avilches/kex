import type { IconSvgElement } from "@hugeicons/react";
import { fileIconUrl, folderIconUrl } from "@/modules/explorer/lib/iconResolver";

const SVG_NS = "http://www.w3.org/2000/svg";

// Renders a @hugeicons icon object as a plain SVG element, mirroring the props
// HugeiconsIcon applies (24 viewBox, currentColor, optional absolute stroke).
export function icon(data: IconSvgElement, size = 16, strokeWidth?: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("color", "currentColor");
  if (strokeWidth !== undefined) {
    svg.setAttribute("stroke-width", String(strokeWidth));
    svg.setAttribute("stroke", "currentColor");
  }
  for (const [tag, attrs] of data) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "key" || value === undefined) continue;
      if (strokeWidth !== undefined && (key === "stroke" || key === "strokeWidth")) continue;
      child.setAttribute(key, String(value));
    }
    if (strokeWidth !== undefined) {
      child.setAttribute("stroke-width", String(strokeWidth));
      child.setAttribute("stroke", "currentColor");
    }
    svg.append(child);
  }
  return svg;
}

export function fileIcon(name: string): HTMLImageElement {
  const img = document.createElement("img");
  img.src = fileIconUrl(name);
  img.alt = "";
  img.className = "size-4 shrink-0";
  return img;
}

export function folderIcon(name: string, expanded: boolean): HTMLImageElement {
  const img = document.createElement("img");
  img.src = folderIconUrl(name, expanded);
  img.alt = "";
  img.className = "size-4 shrink-0";
  return img;
}

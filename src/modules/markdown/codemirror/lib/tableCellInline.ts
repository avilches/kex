export type CellSegment = { type: "text"; value: string } | { type: "link"; text: string; url: string };

// Only `[text](url)` is recognized inside a rendered table cell; bold, italic,
// code and every other inline construct show as their literal text (scope cut).
const LINK = /\[([^\]]*)\]\(([^)]*)\)/g;

export function cellSegments(raw: string): CellSegment[] {
  const segments: CellSegment[] = [];
  let last = 0;
  for (const match of raw.matchAll(LINK)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ type: "text", value: raw.slice(last, start) });
    segments.push({ type: "link", text: match[1], url: linkDestination(match[2]) });
    last = start + match[0].length;
  }
  if (last < raw.length) segments.push({ type: "text", value: raw.slice(last) });
  return segments;
}

// A destination may carry a title (`url "Title"`) or angle brackets (`<url>`).
function linkDestination(inner: string): string {
  const trimmed = inner.trim();
  if (trimmed.startsWith("<")) {
    const close = trimmed.indexOf(">");
    return close > 0 ? trimmed.slice(1, close) : trimmed.slice(1);
  }
  return trimmed.split(/\s+/)[0] ?? "";
}

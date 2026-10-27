export type StyleColor = number | string;

export type RunStyle = {
  fg?: StyleColor;
  bg?: StyleColor;
  bold?: true;
  dim?: true;
  italic?: true;
  underline?: true;
  inverse?: true;
  strike?: true;
};

export type Run = { text: string; style: RunStyle };
export type StyledLine = Run[];

export const HIBERNATE_LINES_MAX = 500;
export const HIBERNATE_LINES_MAX_BYTES = 256 * 1024;
export const REDACTED = "[redacted]";

const ESC = "\u001b";
// OSC (to BEL or ST), then any other CSI, then SGR is told apart by its final byte.
const SEQUENCE = new RegExp(`${ESC}\\](?:[^\u0007${ESC}]|${ESC}(?!\\\\))*(?:\u0007|${ESC}\\\\)|${ESC}\\[([0-9;:?]*)([ -/]*[@-~])|${ESC}[@-Z\\\\-_]`, "g");

function applySgr(style: RunStyle, params: string): RunStyle {
  const codes = params === "" ? [0] : params.split(/[;:]/).map((p) => (p === "" ? 0 : Number(p)));
  let next: RunStyle = { ...style };
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (Number.isNaN(c)) continue;
    if (c === 0) next = {};
    else if (c === 1) next.bold = true;
    else if (c === 2) next.dim = true;
    else if (c === 3) next.italic = true;
    else if (c === 4) next.underline = true;
    else if (c === 7) next.inverse = true;
    else if (c === 9) next.strike = true;
    else if (c === 22) {
      delete next.bold;
      delete next.dim;
    } else if (c === 23) delete next.italic;
    else if (c === 24) delete next.underline;
    else if (c === 27) delete next.inverse;
    else if (c === 29) delete next.strike;
    else if (c >= 30 && c <= 37) next.fg = c - 30;
    else if (c >= 90 && c <= 97) next.fg = c - 90 + 8;
    else if (c >= 40 && c <= 47) next.bg = c - 40;
    else if (c >= 100 && c <= 107) next.bg = c - 100 + 8;
    else if (c === 39) delete next.fg;
    else if (c === 49) delete next.bg;
    else if (c === 38 || c === 48) {
      const key = c === 38 ? "fg" : "bg";
      const mode = codes[i + 1];
      if (mode === 5 && Number.isInteger(codes[i + 2])) {
        next[key] = Math.min(255, Math.max(0, codes[i + 2]));
        i += 2;
      } else if (mode === 2) {
        // 38;2;r;g;b, or the colon form 38:2::r:g:b with an empty colour-space slot already read as 0.
        const rgb = codes.length - (i + 2) >= 4 && codes[i + 2] === 0 ? codes.slice(i + 3, i + 6) : codes.slice(i + 2, i + 5);
        if (rgb.length === 3 && rgb.every((n) => Number.isInteger(n))) {
          next[key] = `#${rgb.map((n) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, "0")).join("")}`;
        }
        i += codes.length - (i + 2) >= 4 && codes[i + 2] === 0 ? 5 : 4;
      }
    }
  }
  return next;
}

function sameStyle(a: RunStyle, b: RunStyle): boolean {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.inverse === b.inverse &&
    a.strike === b.strike
  );
}

function pushRun(line: StyledLine, text: string, style: RunStyle): void {
  if (!text) return;
  const last = line[line.length - 1];
  if (last && sameStyle(last.style, style)) last.text += text;
  else line.push({ text, style: { ...style } });
}

// Style carries across line breaks like it does in a terminal, so each returned line is
// self-contained. Anything that is not a colour (cursor moves, titles, hyperlinks) is dropped.
export function parseAnsi(input: string): StyledLine[] {
  const lines: StyledLine[] = [[]];
  let style: RunStyle = {};
  const text = (chunk: string) => {
    const parts = chunk.split(/\r?\n/);
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      pushRun(lines[lines.length - 1], part.replace(/\r/g, ""), style);
    });
  };
  let at = 0;
  for (const m of input.matchAll(SEQUENCE)) {
    text(input.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[2] === "m" && m[1] !== undefined && !m[1].startsWith("?")) style = applySgr(style, m[1]);
  }
  text(input.slice(at));
  return lines;
}

function sgrFor(style: RunStyle): string {
  const codes: (number | string)[] = [0];
  if (style.bold) codes.push(1);
  if (style.dim) codes.push(2);
  if (style.italic) codes.push(3);
  if (style.underline) codes.push(4);
  if (style.inverse) codes.push(7);
  if (style.strike) codes.push(9);
  for (const [key, base] of [["fg", 38], ["bg", 48]] as const) {
    const color = style[key];
    if (typeof color === "number") codes.push(base, 5, color);
    else if (typeof color === "string") {
      const n = parseInt(color.slice(1), 16);
      codes.push(base, 2, (n >> 16) & 255, (n >> 8) & 255, n & 255);
    }
  }
  return `${ESC}[${codes.join(";")}m`;
}

export function serializeLines(lines: readonly StyledLine[]): string {
  return lines
    .map((line) => line.map((r) => `${sgrFor(r.style)}${r.text}`).join("") + (line.length ? `${ESC}[0m` : ""))
    .join("\n");
}

function lineText(line: StyledLine): string {
  return line.map((r) => r.text).join("");
}

// The last `max` lines, once the empty ones at the bottom (the unused rows of the screen) are gone.
export function tailLines(lines: readonly StyledLine[], max: number): StyledLine[] {
  let end = lines.length;
  while (end > 0 && lineText(lines[end - 1]).trim() === "") end--;
  return lines.slice(Math.max(0, end - max), end).map((l) => l.map((r) => ({ text: r.text, style: { ...r.style } })));
}

const encoder = new TextEncoder();

// Whole lines are dropped from the top until the stored text fits; a line is never cut in half.
export function clipToBytes(lines: readonly StyledLine[], maxBytes: number): StyledLine[] {
  let start = 0;
  let size = encoder.encode(serializeLines(lines)).length;
  while (size > maxBytes && start < lines.length - 1) {
    size -= encoder.encode(serializeLines([lines[start]])).length + 1;
    start++;
  }
  return lines.slice(start);
}

// The token is the last group, the groups before it are context that stays.
const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(gh[pousr]_[A-Za-z0-9]{20,})/g,
  /\b(github_pat_[A-Za-z0-9_]{20,})/g,
  /\b(sk-[A-Za-z0-9_-]{16,})/g,
  /\b(AKIA[0-9A-Z]{16})\b/g,
  /\b(xox[abprs]-[A-Za-z0-9-]{10,})/g,
  /\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/g,
  /(\bBearer\s+)([A-Za-z0-9._~+/=-]{16,})/gi,
  /(\b[A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY)[A-Za-z0-9_]*\s*[=:]\s*["']?)([^\s"']{4,})/gi,
];

export function secretRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const re of SECRET_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const secret = m[m.length - 1];
      const start = m.index + m[0].length - secret.length;
      ranges.push([start, start + secret.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

// Matching is done on the plain text of the line, so a token that a colour change cuts in two is
// still found; the placeholder keeps the style of the run where the token began.
export function redactLine(line: StyledLine): StyledLine {
  const ranges = secretRanges(lineText(line));
  if (ranges.length === 0) return line;
  const out: StyledLine = [];
  let offset = 0;
  for (const run of line) {
    const runEnd = offset + run.text.length;
    let cursor = offset;
    for (const [start, end] of ranges) {
      if (end <= offset || start >= runEnd) continue;
      pushRun(out, run.text.slice(cursor - offset, Math.max(start, offset) - offset), run.style);
      if (start >= offset) pushRun(out, REDACTED, run.style);
      cursor = Math.min(end, runEnd);
    }
    pushRun(out, run.text.slice(cursor - offset), run.style);
    offset = runEnd;
  }
  return out;
}

// What gets stored for a tab: the colours kept, the last lines only, secrets crossed out, bounded in size.
export function prepareHibernateLines(
  snapshot: string,
  max = HIBERNATE_LINES_MAX,
  maxBytes = HIBERNATE_LINES_MAX_BYTES,
): string {
  const tail = tailLines(parseAnsi(snapshot), max).map(redactLine);
  return serializeLines(clipToBytes(tail, maxBytes));
}

// xterm serializes the normal buffer first and, when an app is on the alternate screen, switches to
// it with this sequence and writes that screen after it.
const ALT_SCREEN_START = `${ESC}[?1049h${ESC}[H`;

export function altScreenOf(serialized: string): string | null {
  const at = serialized.lastIndexOf(ALT_SCREEN_START);
  return at < 0 ? null : serialized.slice(at + ALT_SCREEN_START.length);
}

// A full-screen app (top, vim, an agent) is kept as the grid it was: exactly `rows` lines, the blank
// ones included, so the placeholder shows it where the app had drawn it.
export function prepareAltScreenLines(
  serialized: string,
  rows: number,
  maxBytes = HIBERNATE_LINES_MAX_BYTES,
): string {
  const screen = altScreenOf(serialized);
  if (screen === null) return "";
  const lines = parseAnsi(screen);
  if (lines.every((l) => l.every((r) => r.text.trim() === "" && r.style.bg === undefined))) return "";
  const grid = lines.slice(-Math.max(1, rows));
  while (grid.length < rows) grid.push([]);
  return serializeLines(clipToBytes(grid.map(redactLine), maxBytes));
}

// The stored lines as a terminal replays them when the tab wakes: faint, so they read as history
// above the new prompt, with the blank rows of a full-screen grid gone and a break at the end.
export function wakeBackdrop(stored: string): string {
  const lines = tailLines(parseAnsi(stored), Number.MAX_SAFE_INTEGER).map((line) =>
    line.map((run) => ({ text: run.text, style: { ...run.style, dim: true as const } })),
  );
  if (lines.length === 0) return "";
  return `${serializeLines(lines).replace(/\n/g, "\r\n")}\r\n`;
}

export type LeafScreen ={ text: string; alt: boolean; rows: number };

export function prepareHibernateScreen(screen: LeafScreen): string {
  return screen.alt ? prepareAltScreenLines(screen.text, screen.rows) : prepareHibernateLines(screen.text);
}

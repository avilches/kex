export type InspectableBuffer = {
  type: string;
  length: number;
  viewportY: number;
  baseY: number;
  getLine(y: number): unknown;
};

export type InspectableTerminal = {
  cols: number;
  rows: number;
  buffer: { active: InspectableBuffer };
};

export type TerminalHealth = {
  ok: boolean;
  cols: number;
  rows: number;
  bufferType: string;
  bufferLength: number;
  viewportY: number;
  missingViewportLines: number;
  firstMissing: number | null;
  bufferShorterThanRows: boolean;
  error: string | null;
};

const BROKEN: TerminalHealth = {
  ok: false,
  cols: 0,
  rows: 0,
  bufferType: "?",
  bufferLength: 0,
  viewportY: 0,
  missingViewportLines: 0,
  firstMissing: null,
  bufferShorterThanRows: false,
  error: null,
};

// xterm's renderers read every viewport line and dereference it, so one
// undefined line is enough to throw "undefined is not an object (evaluating
// 'x.loadCell')" and leave the terminal black and deaf to input.
export function inspectTerminal(term: InspectableTerminal): TerminalHealth {
  try {
    const { cols, rows } = term;
    const buf = term.buffer.active;
    const bufferShorterThanRows = buf.length < rows;
    let missing = 0;
    let first: number | null = null;
    for (let i = 0; i < rows; i++) {
      const y = buf.viewportY + i;
      if (buf.getLine(y) === undefined) {
        missing++;
        if (first === null) first = y;
      }
    }
    return {
      ok: cols > 0 && rows > 0 && missing === 0 && !bufferShorterThanRows,
      cols,
      rows,
      bufferType: buf.type,
      bufferLength: buf.length,
      viewportY: buf.viewportY,
      missingViewportLines: missing,
      firstMissing: first,
      bufferShorterThanRows,
      error: null,
    };
  } catch (e) {
    return { ...BROKEN, error: e instanceof Error ? e.message : String(e) };
  }
}

type FieldValue = string | number | boolean | null | undefined;

function formatValue(v: string | number | boolean | null): string {
  if (typeof v === "string" && /[\s"]/.test(v)) return JSON.stringify(v);
  return String(v);
}

export function formatPoolEvent(
  event: string,
  fields: Record<string, FieldValue>,
): string {
  let out = `[pool] ${event}`;
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    out += ` ${k}=${formatValue(v)}`;
  }
  return out;
}

export function healthFields(h: TerminalHealth): Record<string, FieldValue> {
  return {
    ok: h.ok,
    cols: h.cols,
    rows: h.rows,
    buf: h.bufferType,
    bufLen: h.bufferLength,
    viewportY: h.viewportY,
    missing: h.missingViewportLines,
    firstMissing: h.firstMissing,
    short: h.bufferShorterThanRows || undefined,
    err: h.error ?? undefined,
  };
}

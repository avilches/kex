import { describe, expect, it } from "vitest";
import {
  clipToBytes,
  parseAnsi,
  prepareHibernateLines,
  redactLine,
  REDACTED,
  secretRanges,
  serializeLines,
  tailLines,
} from "./hibernateLines";

const E = "\u001b";
const plain = (lines: ReturnType<typeof parseAnsi>) => lines.map((l) => l.map((r) => r.text).join(""));

describe("parseAnsi", () => {
  it("reads 16, 256 and truecolor foregrounds and backgrounds", () => {
    const [line] = parseAnsi(`${E}[31mred${E}[0m ${E}[38;5;200mpink${E}[48;2;1;2;3m bg`);
    expect(line.map((r) => [r.text, r.style])).toEqual([
      ["red", { fg: 1 }],
      [" ", {}],
      ["pink", { fg: 200 }],
      [" bg", { fg: 200, bg: "#010203" }],
    ]);
  });

  it("reads the colon form of truecolor, with its empty colour-space slot", () => {
    const [line] = parseAnsi(`${E}[38:2::10:20:30mx`);
    expect(line[0].style.fg).toBe("#0a141e");
  });

  it("carries the style across line breaks so each line is self-contained", () => {
    const lines = parseAnsi(`${E}[1;32ma\nb${E}[0m\nc`);
    expect(lines.map((l) => l[0].style)).toEqual([{ bold: true, fg: 2 }, { bold: true, fg: 2 }, {}]);
  });

  it("maps bright colours to 8..15 and handles resets of single attributes", () => {
    const [line] = parseAnsi(`${E}[91;1;3ma${E}[22;23mb${E}[39mc`);
    expect(line.map((r) => r.style)).toEqual([{ fg: 9, bold: true, italic: true }, { fg: 9 }, {}]);
  });

  it("drops cursor moves, titles and hyperlinks but keeps their text", () => {
    const [line] = parseAnsi(`${E}[2K${E}]0;title\u0007hi${E}[3;4H there${E}]8;;http://x${E}\\!`);
    expect(plain([line])[0]).toBe("hi there!");
  });

  it("normalises CRLF", () => {
    expect(plain(parseAnsi("a\r\nb"))).toEqual(["a", "b"]);
  });
});

describe("serializeLines", () => {
  it("round trips through parseAnsi", () => {
    const lines = parseAnsi(`${E}[1;31mboom${E}[0m plain ${E}[48;5;4mbg${E}[0m\nsecond`);
    expect(parseAnsi(serializeLines(lines))).toEqual(lines);
  });
});

describe("tailLines", () => {
  it("drops the empty rows at the bottom and keeps the last N", () => {
    expect(plain(tailLines(parseAnsi("a\nb\nc\nd\n   \n\n"), 2))).toEqual(["c", "d"]);
  });

  it("returns nothing for an empty screen", () => {
    expect(tailLines(parseAnsi("\n\n"), 5)).toEqual([]);
  });
});

describe("clipToBytes", () => {
  it("drops whole lines from the top until it fits", () => {
    const lines = parseAnsi("aaaa\nbbbb\ncccc");
    const fits = new TextEncoder().encode(serializeLines(lines.slice(1))).length;
    expect(plain(clipToBytes(lines, fits))).toEqual(["bbbb", "cccc"]);
  });

  it("always keeps the last line", () => {
    expect(plain(clipToBytes(parseAnsi("a\nb"), 1))).toEqual(["b"]);
  });
});

describe("secrets", () => {
  const redacted = (text: string) => plain([redactLine(parseAnsi(text)[0])])[0];

  it("crosses out obvious tokens and keeps the context", () => {
    expect(redacted("export GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123")).toBe(`export GITHUB_TOKEN=${REDACTED}`);
    expect(redacted("curl -H 'Authorization: Bearer abcdefghijklmnop1234'")).toContain(`Bearer ${REDACTED}`);
    expect(redacted("key AKIAABCDEFGHIJKLMNOP end")).toBe(`key ${REDACTED} end`);
    expect(redacted("sk-abcdefghijklmnopqrstuv")).toBe(REDACTED);
    expect(redacted("PASSWORD='hunter22'")).toBe(`PASSWORD='${REDACTED}'`);
  });

  it("finds a token that a colour change cuts in two", () => {
    const out = redactLine(parseAnsi(`${E}[31mghp_abcdefghij${E}[0mklmnopqrstuvwxyz0123 tail`)[0]);
    expect(plain([out])[0]).toBe(`${REDACTED} tail`);
    expect(out[0].style).toEqual({ fg: 1 });
  });

  it("leaves ordinary lines alone", () => {
    const line = parseAnsi("ls -la /usr/local/bin")[0];
    expect(redactLine(line)).toBe(line);
    expect(secretRanges("nothing to see")).toEqual([]);
  });
});

describe("prepareHibernateLines", () => {
  it("keeps colours, the tail, and crosses out secrets", () => {
    const out = prepareHibernateLines(`old\n${E}[32mok${E}[0m TOKEN=abcd1234\n\n`, 2);
    expect(plain(parseAnsi(out))).toEqual(["old", `ok TOKEN=${REDACTED}`]);
    expect(out).toContain("38;5;2");
  });
});

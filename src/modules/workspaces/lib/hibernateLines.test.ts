import { describe, expect, it } from "vitest";
import {
  altScreenOf,
  clipToBytes,
  parseAnsi,
  prepareAltScreenLines,
  prepareHibernateLines,
  prepareHibernateScreen,
  redactLine,
  REDACTED,
  secretRanges,
  serializeLines,
  tailLines,
  wakeBackdrop,
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

  it("turns the blank cells xterm serializes as cursor-forward and erase-characters into spaces", () => {
    const [line] = parseAnsi(`Tienes${E}[1Crazón,${E}[3Cme${E}[0m${E}[2Xquedé${E}[C.`);
    expect(plain([line])[0]).toBe("Tienes razón,   me  quedé .");
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

  it("crosses out a quoted key, as in JSON", () => {
    expect(redacted('{"password": "hunter2hunter2"}')).toBe(`{"password": "${REDACTED}"}`);
    expect(redacted("'api_key':'abcd1234efgh'")).toBe(`'api_key':'${REDACTED}'`);
  });

  it("crosses out the value of a secret flag", () => {
    expect(redacted("deploy --password hunter2hunter2 --force")).toBe(`deploy --password ${REDACTED} --force`);
    expect(redacted("cli --api-key=abcd1234efgh run")).toBe(`cli --api-key=${REDACTED} run`);
    expect(redacted("cli --token abcd1234efgh")).toBe(`cli --token ${REDACTED}`);
  });

  it("keeps a secret flag that is followed by another flag", () => {
    expect(redacted("cli --password --verbose")).toBe("cli --password --verbose");
  });

  it("crosses out the password of a URL and keeps the user and the host", () => {
    expect(redacted("git clone https://bob:ghs3cretpw@host.example/r.git")).toBe(
      `git clone https://bob:${REDACTED}@host.example/r.git`,
    );
    expect(redacted("psql postgres://app:p4ssw0rdX@db:5432/main")).toBe(`psql postgres://app:${REDACTED}@db:5432/main`);
  });

  it("leaves a URL without credentials alone", () => {
    const text = "see https://example.com:8443/path?a=b";
    expect(redacted(text)).toBe(text);
  });

  it("crosses out a mysql password glued to -p", () => {
    expect(redacted("mysql -u root -pSuperSecret1 db")).toBe(`mysql -u root -p${REDACTED} db`);
    expect(redacted("mysqldump -pSuperSecret1 db")).toBe(`mysqldump -p${REDACTED} db`);
  });

  it("crosses out a long value that follows the word token with no separator", () => {
    expect(redacted("token abcdefghijklmnop1234")).toBe(`token ${REDACTED}`);
  });

  it("keeps prose that mentions a token", () => {
    const text = "the token refresh job failed";
    expect(redacted(text)).toBe(text);
  });

  it("crosses out a body line of a PEM key but not a hash", () => {
    const body = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj";
    expect(body.length).toBeGreaterThanOrEqual(64);
    expect(redacted(body)).toBe(REDACTED);
    const sha256 = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    expect(redacted(sha256)).toBe(sha256);
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

describe("wakeBackdrop", () => {
  it("makes every run faint, keeps the colours and ends with a line break", () => {
    const out = wakeBackdrop(serializeLines(parseAnsi(`${E}[31mred${E}[0m plain\nsecond`)));
    expect(out.endsWith("\r\n")).toBe(true);
    const lines = parseAnsi(out);
    expect(lines[0].map((r) => [r.text, r.style])).toEqual([
      ["red", { fg: 1, dim: true }],
      [" plain", { dim: true }],
    ]);
    expect(plain(lines.slice(0, 2))).toEqual(["red plain", "second"]);
  });

  it("drops the blank rows at the bottom of a grid and gives nothing for an empty one", () => {
    expect(plain(parseAnsi(wakeBackdrop("TOP\n\n\n"))).filter(Boolean)).toEqual(["TOP"]);
    expect(wakeBackdrop("\n  \n")).toBe("");
  });
});

describe("alternate screen", () => {
  const withAlt = (alt: string) => `normal line\r\nsecond${E}[1B${E}[6D${E}[?1049h${E}[H${alt}`;

  it("takes only what follows the switch to the alternate screen", () => {
    expect(altScreenOf(withAlt("TOP\r\nrow2"))).toBe("TOP\r\nrow2");
    expect(altScreenOf("no alternate screen here")).toBeNull();
  });

  it("keeps the grid: its blank rows are padded up to the rows of the terminal, and its colours stay", () => {
    const out = prepareAltScreenLines(withAlt(`${E}[44mTOP${E}[0m\r\n\r\nrow3`), 6);
    const lines = parseAnsi(out);
    expect(plain(lines)).toEqual(["TOP", "", "row3", "", "", ""]);
    expect(lines[0][0].style.bg).toBe(4);
  });

  it("cuts a grid taller than the terminal from the top and crosses out secrets", () => {
    const out = prepareAltScreenLines(withAlt("a\r\nb\r\nc\r\nTOKEN=abcd1234"), 2);
    expect(plain(parseAnsi(out))).toEqual(["c", `TOKEN=${REDACTED}`]);
  });

  it("stores nothing for an alternate screen with nothing drawn, or one that cannot be found", () => {
    expect(prepareAltScreenLines(withAlt("\r\n  \r\n"), 4)).toBe("");
    expect(prepareAltScreenLines("plain", 4)).toBe("");
  });

  it("chooses by the kind of screen", () => {
    expect(plain(parseAnsi(prepareHibernateScreen({ text: withAlt("TOP"), alt: true, rows: 2 })))).toEqual(["TOP", ""]);
    expect(plain(parseAnsi(prepareHibernateScreen({ text: "a\nb\n\n", alt: false, rows: 2 })))).toEqual(["a", "b"]);
  });
});

describe("prepareHibernateScreen keeps the cursor row", () => {
  const lines = (text: string, rows: number) => plain(parseAnsi(prepareHibernateScreen({ text, alt: false, rows })));

  it("pads an unscrolled screen to its rows, so a cursor at the top stays at the top", () => {
    expect(lines(`$ \r\nb${E}[1A${E}[1C`, 5)).toEqual(["$ ", "b", "", "", ""]);
  });

  it("keeps the rows under a cursor that moved below the last line of a scrolled screen", () => {
    expect(lines(`a\nb\nc${E}[2B`, 2)).toEqual(["a", "b", "c", "", ""]);
  });

  it("adds nothing to a scrolled screen whose cursor is on its last line", () => {
    expect(lines("a\nb\nc", 2)).toEqual(["a", "b", "c"]);
  });
});

describe("prepareHibernateLines", () => {
  it("keeps colours, the tail, and crosses out secrets", () => {
    const out = prepareHibernateLines(`old\n${E}[32mok${E}[0m TOKEN=abcd1234\n\n`, 2);
    expect(plain(parseAnsi(out))).toEqual(["old", `ok TOKEN=${REDACTED}`]);
    expect(out).toContain("38;5;2");
  });
});

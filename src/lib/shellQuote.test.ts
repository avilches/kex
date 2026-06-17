import { describe, expect, it } from "vitest";
import { quoteShellArg } from "./shellQuote";

describe("quoteShellArg (posix)", () => {
  const q = (s: string) => quoteShellArg(s, false);

  it("wraps a plain string in single quotes", () => {
    expect(q("fix the bug")).toBe("'fix the bug'");
  });

  it("escapes embedded single quotes with the '\\'' dance", () => {
    expect(q("it's broken")).toBe("'it'\\''s broken'");
  });

  it("neutralizes shell metacharacters", () => {
    expect(q("a; rm -rf / $(whoami) `id` && b")).toBe(
      "'a; rm -rf / $(whoami) `id` && b'",
    );
  });

  it("quotes an empty string to a real empty argument", () => {
    expect(q("")).toBe("''");
  });

  it("cannot break out of the quoted argument", () => {
    expect(q("'; rm -rf /; '")).toBe("''\\''; rm -rf /; '\\'''");
  });
});

describe("quoteShellArg (windows/cmd.exe and pwsh)", () => {
  const q = (s: string) => quoteShellArg(s, true);

  it("wraps a plain string in double quotes", () => {
    expect(q("fix the bug")).toBe('"fix the bug"');
  });

  it("wraps a Windows path with spaces in double quotes", () => {
    expect(q("C:/Some Dir")).toBe('"C:/Some Dir"');
  });

  it("escapes embedded double quotes with backslash", () => {
    expect(q('C:/Has"Quote')).toBe('"C:/Has\\"Quote"');
  });

  it("quotes an empty string", () => {
    expect(q("")).toBe('""');
  });

  it("works with normal Windows paths", () => {
    expect(q("C:/Normal")).toBe('"C:/Normal"');
  });
});

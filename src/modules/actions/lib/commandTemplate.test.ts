import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  commandProblem,
  commandVariablesUsed,
  expandCommandArgv,
  expandCommandShell,
  missingVariables,
  splitArgv,
} from "./commandTemplate";

describe("splitArgv", () => {
  it("splits on whitespace and ignores runs of it", () => {
    expect(splitArgv("  pycharm   {cwd}\t--wait ")).toEqual(["pycharm", "{cwd}", "--wait"]);
  });

  it("keeps quoted text together and drops the quotes", () => {
    expect(splitArgv(`"/Applications/My App/bin" --flag='a b' c"d e"f`)).toEqual([
      "/Applications/My App/bin",
      "--flag=a b",
      "cd ef",
    ]);
  });

  it("keeps an empty quoted argument", () => {
    expect(splitArgv(`cmd "" ''`)).toEqual(["cmd", "", ""]);
  });

  it("does not interpret anything inside single quotes", () => {
    expect(splitArgv(String.raw`'a\b "c" $d'`)).toEqual([String.raw`a\b "c" $d`]);
  });

  it("escapes only quote, backslash, dollar and backtick inside double quotes", () => {
    expect(splitArgv(String.raw`"a \" \\ \$ \x"`)).toEqual([String.raw`a " \ $ \x`]);
  });

  it("escapes a space or a quote outside quotes and leaves other backslashes alone", () => {
    expect(splitArgv(String.raw`a\ b C:\tools\x.exe \'q`)).toEqual(["a b", String.raw`C:\tools\x.exe`, "'q"]);
  });

  it("returns nothing for a blank command", () => {
    expect(splitArgv("   ")).toEqual([]);
  });

  it("throws on an unterminated quote", () => {
    expect(() => splitArgv(`cmd "abc`)).toThrow(/unterminated/);
    expect(() => splitArgv(`cmd 'abc`)).toThrow(/unterminated/);
  });
});

describe("commandProblem", () => {
  it("is null for a command that can be launched", () => {
    expect(commandProblem("pycharm {cwd}")).toBeNull();
  });

  it("explains an empty command and an unterminated quote", () => {
    expect(commandProblem("  ")).toMatch(/empty/);
    expect(commandProblem(`a "b`)).toMatch(/unterminated/);
  });
});

describe("expandCommandArgv", () => {
  it("substitutes inside each argument and never splits on the value", () => {
    expect(expandCommandArgv("pycharm {cwd}", { cwd: "/a b/c d" })).toEqual(["pycharm", "/a b/c d"]);
  });

  it("a value with quotes or spaces cannot add arguments", () => {
    const evil = `x" --exec 'rm -rf /' "y`;
    expect(expandCommandArgv(`open --file={path} --end`, { path: evil })).toEqual([
      "open",
      `--file=${evil}`,
      "--end",
    ]);
  });

  it("keeps ~ and the home as given, since there is no shell to expand them", () => {
    expect(expandCommandArgv("ed {cwd}", { cwd: "~/x" })).toEqual(["ed", "~/x"]);
  });

  it("needs quotes around a group that holds spaces and supports the title syntax in it", () => {
    expect(expandCommandArgv(`run "{?branch on {branch}}"`, { branch: "main" })).toEqual(["run", " on main"]);
    expect(expandCommandArgv(`run "{?branch on {branch}}"`, { branch: "" })).toEqual(["run", ""]);
  });

  it("falls back across variables like a title does", () => {
    expect(expandCommandArgv("e {path|cwd}", { path: "", cwd: "/w" })).toEqual(["e", "/w"]);
  });

  it("leaves an unknown variable literal and honors doubled braces", () => {
    expect(expandCommandArgv("e {nope} {{cwd}}", { cwd: "/w" })).toEqual(["e", "{nope}", "{cwd}"]);
  });

  it("keeps an argument whose variable is empty as an empty argument", () => {
    expect(expandCommandArgv("e {path} x", { path: "" })).toEqual(["e", "", "x"]);
  });

  it("does not resolve names that live on Object.prototype", () => {
    expect(expandCommandArgv("e {constructor}", {})).toEqual(["e", "{constructor}"]);
  });
});

describe("expandCommandShell", () => {
  it("quotes each value for posix and leaves the rest of the command alone", () => {
    expect(expandCommandShell("npm run dev -- --root {cwd}", { cwd: "/a b/it's" }, "posix")).toBe(
      `npm run dev -- --root '/a b/it'\\''s'`,
    );
  });

  it("quotes for PowerShell by doubling single quotes, curly ones included", () => {
    expect(expandCommandShell("code {cwd}", { cwd: "C:\\a b\\it's \u2019" }, "powershell")).toBe(
      "code 'C:\\a b\\it''s \u2019\u2019'",
    );
  });

  it("preserves whitespace and line breaks outside the variables", () => {
    const cmd = "echo   {dir}\n\n  ls  -la\n";
    expect(expandCommandShell(cmd, { dir: "x" }, "posix")).toBe("echo   'x'\n\n  ls  -la\n");
  });

  it("never turns the home into ~", () => {
    expect(expandCommandShell("ls {cwd}", { cwd: "/Users/me/p" }, "posix")).toBe("ls '/Users/me/p'");
  });

  it("decides emptiness on the raw value, not on the quoted one", () => {
    expect(expandCommandShell("a {path|cwd}", { path: "", cwd: "/w" }, "posix")).toBe("a '/w'");
    expect(expandCommandShell("a{?path  --f {path}}", { path: "" }, "posix")).toBe("a");
  });

  it("an empty value writes nothing, since the action is disabled before getting here", () => {
    expect(expandCommandShell("a {path} b", { path: "" }, "posix")).toBe("a  b");
  });

  it("leaves shell braces and parameter expansions that are not variables untouched", () => {
    expect(expandCommandShell("{ echo $HOME; } && echo ${HOME}", {}, "posix")).toBe(
      "{ echo $HOME; } && echo ${HOME}",
    );
  });
});

const hasShell = (name: string) => spawnSync(name, ["-c", "exit 0"]).status === 0;

const NASTY = [
  "/tmp/a b/c",
  `/tmp/it's`,
  `/tmp/say "hi"`,
  "/tmp/$HOME/$(echo pwned)",
  "/tmp/`echo pwned`",
  "/tmp/semi;colon&pipe",
  "/tmp/-leading dash",
  "/tmp/new\nline",
  "/tmp/~tilde",
  "/tmp/glob*?[x]",
];

for (const shell of ["bash", "zsh"]) {
  describe.skipIf(!hasShell(shell))(`expandCommandShell run by ${shell}`, () => {
    for (const value of NASTY) {
      it(`passes ${JSON.stringify(value)} as exactly one argument`, () => {
        const line = expandCommandShell(`printf '%s\\0' {cwd} tail`, { cwd: value }, "posix");
        const res = spawnSync(shell, ["-c", line]);
        expect(res.status).toBe(0);
        expect(res.stdout.toString().split("\0").slice(0, -1)).toEqual([value, "tail"]);
      });
    }

    it("keeps a multi-line command working", () => {
      const line = expandCommandShell("a={cwd}\nprintf '%s' \"$a\"\n", { cwd: "/x y" }, "posix");
      const res = spawnSync(shell, ["-c", line]);
      expect(res.stdout.toString()).toBe("/x y");
    });
  });
}

describe("commandVariablesUsed and missingVariables", () => {
  it("lists every variable the template names, groups and conditions included", () => {
    expect([...commandVariablesUsed("a {path|cwd} {?branch b {dir}} {!repo x}")].sort()).toEqual([
      "branch",
      "cwd",
      "dir",
      "path",
      "repo",
    ]);
  });

  it("reports the used variables that have no value", () => {
    expect(missingVariables("pycharm {path}", { path: "", cwd: "/w" })).toEqual(["path"]);
    expect(missingVariables("pycharm {cwd}", { cwd: "/w" })).toEqual([]);
  });

  it("a variable with a fallback that has a value is not missing", () => {
    expect(missingVariables("e {path|cwd}", { path: "", cwd: "/w" })).toEqual([]);
    expect(missingVariables("e {path|cwd}", { path: "", cwd: " " })).toEqual(["path", "cwd"]);
  });

  it("an optional part does not make the action unavailable", () => {
    expect(missingVariables("e {cwd}{?branch  --b {branch}}", { cwd: "/w", branch: "" })).toEqual([]);
  });

  it("ignores names that are not variables of the scope", () => {
    expect(missingVariables("echo {nope} ${HOME}", { cwd: "/w" })).toEqual([]);
  });

  it("is order stable and lists each missing name once", () => {
    expect(missingVariables("{path} {path} {file}", { path: "", file: "" })).toEqual(["path", "file"]);
  });
});

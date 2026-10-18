import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("keeps every backslash, inside quotes or not, so Windows paths survive", () => {
    const command = '\\\\server\\share C:\\tools\\x.exe "C:\\Program Files\\x" "C:\\dir\\"';
    expect(splitArgv(command)).toEqual([
      "\\\\server\\share",
      "C:\\tools\\x.exe",
      "C:\\Program Files\\x",
      "C:\\dir\\",
    ]);
  });

  it("a backslash before a space does not escape it: the argument splits and both backslashes stay", () => {
    expect(splitArgv("C:\\Program\\ Files\\x")).toEqual(["C:\\Program\\", "Files\\x"]);
  });

  it("puts a quote in an argument by wrapping it in the other kind", () => {
    expect(splitArgv(`'say "hi"' "it's"`)).toEqual([`say "hi"`, "it's"]);
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

  it("for a script, refuses a variable inside the user's own quotes and names it", () => {
    expect(commandProblem(`printf "{cwd}"`, "posix")).toMatch(/\{cwd\} sits inside quotes/);
    expect(commandProblem(`echo '{file}' {cwd}`, "posix")).toMatch(/\{file\}/);
    expect(commandProblem("echo x\n  cd \"a {?dir {dir}}\"", "powershell")).toMatch(/\{dir\}/);
  });

  it("for a script, accepts bare variables and quotes that hold no variable or a literal brace", () => {
    expect(commandProblem(`printf "%s" {cwd} 'a b' "{{cwd}}"`, "posix")).toBeNull();
    expect(commandProblem(`echo "\${HOME}" "{ x; }" {cwd}`, "posix")).toBeNull();
    expect(commandProblem(`echo \\"{cwd}`, "posix")).toBeNull();
    expect(commandProblem("echo `\"{cwd}", "powershell")).toBeNull();
  });

  it("for a script, an apostrophe in a comment is not an unterminated quote", () => {
    expect(commandProblem("echo hi # don't\n", "posix")).toBeNull();
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

  it("strips control characters from values for PowerShell too", () => {
    expect(expandCommandShell("code {cwd}", { cwd: "C:\\a\r\nb\x1b" }, "powershell")).toBe("code 'C:\\ab'");
  });

  it("refuses a variable inside the command's own quotes, for either shell", () => {
    expect(() => expandCommandShell(`echo "{cwd}"`, { cwd: "/x" }, "posix")).toThrow(/\{cwd\} sits inside quotes/);
    expect(() => expandCommandShell(`echo '{cwd}'`, { cwd: "/x" }, "powershell")).toThrow(/inside quotes/);
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

    it("drops control characters from a value, a newline included, so it cannot end the line", () => {
      const line = expandCommandShell(`printf '%s\\0' {cwd} tail`, { cwd: "/tmp/a\nb\tc\x1b[31m\x7fd\0e" }, "posix");
      const res = spawnSync(shell, ["-c", line]);
      expect(res.stdout.toString().split("\0").slice(0, -1)).toEqual(["/tmp/ab" + "c[31mde", "tail"]);
    });

    it("a bare $(...) in a value does not run", () => {
      const dir = mkdtempSync(join(tmpdir(), "kex-cmd-"));
      try {
        const line = expandCommandShell("printf '%s' {cwd}", { cwd: "$(touch PWNED)" }, "posix");
        const res = spawnSync(shell, ["-c", line], { cwd: dir });
        expect(res.stdout.toString()).toBe("$(touch PWNED)");
        expect(existsSync(join(dir, "PWNED"))).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("the same $(...) in the user's double quotes would run, which is why Kex refuses that command", () => {
      const dir = mkdtempSync(join(tmpdir(), "kex-cmd-"));
      try {
        const command = `printf '%s' "{cwd}"`;
        expect(() => expandCommandShell(command, { cwd: "$(touch PWNED)" }, "posix")).toThrow(/inside quotes/);
        const unsafe = command.replace("{cwd}", "$(touch PWNED)");
        spawnSync(shell, ["-c", unsafe], { cwd: dir });
        expect(existsSync(join(dir, "PWNED"))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("keeps a multi-line command working", () => {
      const line = expandCommandShell("a={cwd}\nprintf '%s' \"$a\"\n", { cwd: "/x y" }, "posix");
      const res = spawnSync(shell, ["-c", line]);
      expect(res.stdout.toString()).toBe("/x y");
    });
  });
}

const INJECTION = "$(touch PWNED)";

describe("quote detector: cases that used to slip through", () => {
  const flagged: [string, string, "posix" | "powershell"][] = [
    ["nested quotes in a command substitution", `echo "$(echo "{cwd}")"`, "posix"],
    ["nested quotes in a PowerShell subexpression", `Write-Host "$(Get-Item "{cwd}")"`, "powershell"],
    ["a backslash before the brace inside double quotes", `echo "\\{cwd}"`, "posix"],
    ["a backslash before the brace outside quotes", `echo \\{cwd}`, "posix"],
    ["a backtick before the brace in PowerShell double quotes", "Write-Host \"`{cwd}\"", "powershell"],
    ["PowerShell smart double quotes", "Write-Host \u201c{cwd}\u201d", "powershell"],
    ["PowerShell smart single quotes", "Write-Host \u2018{cwd}\u2019", "powershell"],
    ["a bash ANSI-C string", `echo $'x {cwd} y'`, "posix"],
    ["a heredoc body", "cat <<EOF\nroot: {cwd}\nEOF\n", "posix"],
    ["a group in single quotes that holds a known variable", `jq '{a: {cwd}}'`, "posix"],
  ];
  for (const [name, command, shell] of flagged) {
    it(`flags ${name}`, () => {
      expect(commandProblem(command, shell)).toMatch(/\{\w+\}/);
      expect(() => expandCommandShell(command, { cwd: "/x" }, shell)).toThrow();
    });
  }

  it("lets a variable stand bare inside a substitution that has its own quotes", () => {
    expect(commandProblem(`echo "$(echo {cwd})"`, "posix")).toBeNull();
  });

  it("does not flag braces that are not known variables", () => {
    expect(commandProblem(`awk '{print}' {cwd}`, "posix")).toBeNull();
    expect(commandProblem(`jq '{a}' {cwd}`, "posix")).toBeNull();
    expect(expandCommandShell(`awk '{print}' {cwd}`, { cwd: "/x" }, "posix")).toBe(`awk '{print}' '/x'`);
  });

  it("is not thrown off by apostrophes in comments and heredoc bodies", () => {
    expect(commandProblem("# don't\necho {cwd}", "posix")).toBeNull();
    expect(commandProblem("echo hi # don't\necho {cwd}", "posix")).toBeNull();
    expect(commandProblem("cat <<EOF\nit's here\nEOF\necho {cwd}", "posix")).toBeNull();
    expect(commandProblem("cat <<'EOF'\ndon't\nEOF\necho {cwd}", "posix")).toBeNull();
    expect(commandProblem("# it's\nls {cwd}", "powershell")).toBeNull();
    expect(commandProblem("<# it's #> ls {cwd}", "powershell")).toBeNull();
  });
});

describe("heredoc delimiters are full shell words", () => {
  const body = (delimiter: string, closing = delimiter) => `cat <<${delimiter}\nA\n{cwd}\n${closing}\n`;
  const tricky: [string, string][] = [
    ["a dash", body("A-B")],
    ["a dot", body("a.b")],
    ["a colon", body("A:")],
    ["a quoted fragment", body('A"B"C', "ABC")],
    ["a single-quoted fragment", body("A'B'C", "ABC")],
    ["a backslash-newline join", "cat <<A\\\nB\nA\n{cwd}\nAB\n"],
    ["an escaped character", body("A\\-B", "A-B")],
    ["a dash-stripped delimiter", "cat <<-A-B\n\tA\n\t{cwd}\n\tA-B\n"],
    ["two heredocs on a line", "cat <<X <<Y-Z\nx\nX\n{cwd}\nY-Z\n"],
  ];
  for (const [name, command] of tricky) {
    it(`flags a variable in the body of a heredoc with ${name}`, () => {
      expect(commandProblem(command, "posix")).toMatch(/\{cwd\}/);
    });
  }

  it("is conservative when the delimiter cannot be known: the rest is body", () => {
    for (const d of ["$x", "`id`", '"unterminated', "'unterminated"]) {
      expect(commandProblem(`cat <<${d}\nx\n{cwd}\n`, "posix")).toMatch(/\{cwd\}/);
    }
  });

  it("lets a variable stand outside the body", () => {
    expect(commandProblem("cat <<A-B\nx\nA-B\necho {cwd}\n", "posix")).toBeNull();
    expect(commandProblem("cat <<'EOF'\nit's\nEOF\nls {cwd}", "posix")).toBeNull();
    expect(commandProblem("cat <<-EOF\n\tx\n\tEOF\nls {cwd}", "posix")).toBeNull();
    expect(commandProblem("cat {cwd} <<A.B\nx\nA.B\n", "posix")).toBeNull();
    expect(commandProblem('cat <<A"B"C\nx\nABC\nls {cwd}\n', "posix")).toBeNull();
  });
});

for (const shell of ["bash", "zsh"]) {
  describe.skipIf(!hasShell(shell))(`heredoc canary run by ${shell}`, () => {
    for (const delimiter of ["A-B", "a.b", "A:"]) {
      it(`<<${delimiter}: the body would run as written, and Kex refuses it`, () => {
        const dir = mkdtempSync(join(tmpdir(), "kex-cmd-"));
        try {
          const command = `cat <<${delimiter}\nA\n{cwd}\n${delimiter}\n`;
          expect(() => expandCommandShell(command, { cwd: INJECTION }, "posix")).toThrow();
          spawnSync(shell, ["-c", command.replace("{cwd}", INJECTION)], { cwd: dir });
          expect(existsSync(join(dir, "PWNED"))).toBe(true);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
    }

    it("a backslash-newline joined delimiter is refused and would run", () => {
      const dir = mkdtempSync(join(tmpdir(), "kex-cmd-"));
      try {
        const command = "cat <<A\\\nB\nA\n{cwd}\nAB\n";
        expect(() => expandCommandShell(command, { cwd: INJECTION }, "posix")).toThrow();
        spawnSync(shell, ["-c", command.replace("{cwd}", INJECTION)], { cwd: dir });
        expect(existsSync(join(dir, "PWNED"))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("a legitimate heredoc with the variable outside the body runs normally", () => {
      const line = expandCommandShell("cat <<A-B\nhello\nA-B\nprintf '%s' {cwd}\n", { cwd: "/x y" }, "posix");
      expect(spawnSync(shell, ["-c", line]).stdout.toString()).toBe("hello\n/x y");
    });
  });
}

describe("second line of defense on values", () => {
  it("refuses a risky value when the command has double quotes, a backtick or $(", () => {
    for (const command of [`echo "x" {cwd}`, "echo `date` {cwd}", "echo $(date) {cwd}"]) {
      for (const value of [INJECTION, "a`b", 'a"b', "a'b", "a\\b"]) {
        expect(() => expandCommandShell(command, { cwd: value }, "posix")).toThrow(/cannot be inserted safely/);
      }
    }
  });

  it("lets plain values through, and any value when the command has no such construct", () => {
    expect(expandCommandShell(`echo "x" {cwd}`, { cwd: "/a b/c" }, "posix")).toBe(`echo "x" '/a b/c'`);
    expect(expandCommandShell("echo {cwd}", { cwd: INJECTION }, "posix")).toBe(`echo '${INJECTION}'`);
  });

  it("only looks at the values that are written", () => {
    expect(expandCommandShell(`echo "x" {path|cwd}`, { path: "", cwd: "/ok" }, "posix")).toBe(`echo "x" '/ok'`);
  });

  it("applies to PowerShell, where a backslash is harmless", () => {
    expect(() => expandCommandShell('Write-Host "x" {cwd}', { cwd: "a$b" }, "powershell")).toThrow(/safely/);
    expect(() => expandCommandShell('Write-Host "x" {cwd}', { cwd: "it\u2019s" }, "powershell")).toThrow(/safely/);
    expect(expandCommandShell('Write-Host "x" {cwd}', { cwd: "C:\\a b" }, "powershell")).toBe(
      "Write-Host \"x\" 'C:\\a b'",
    );
  });

  it("strips C1 controls and the Unicode line separators from values", () => {
    expect(expandCommandShell("ls {cwd}", { cwd: "a\u0085b\u009fc\u2028d\u2029e" }, "posix")).toBe("ls 'abcde'");
    expect(expandCommandShell("ls {cwd}", { cwd: "a\u2028b" }, "powershell")).toBe("ls 'ab'");
  });
});

for (const shell of ["bash", "zsh"]) {
  describe.skipIf(!hasShell(shell))(`injection canary run by ${shell}`, () => {
    const cases: [string, string][] = [
      ["nested quotes", `printf '%s' "$(printf '%s' "{cwd}")"`],
      ["a backslash before the brace", `printf '%s' "\\{cwd}"`],
      ["an ANSI-C string", `printf '%s' $'{cwd}'`],
    ];
    for (const [name, command] of cases) {
      it(`${name}: the text would run as written, and Kex refuses it`, () => {
        const dir = mkdtempSync(join(tmpdir(), "kex-cmd-"));
        try {
          expect(() => expandCommandShell(command, { cwd: INJECTION }, "posix")).toThrow();
          spawnSync(shell, ["-c", command.replace("{cwd}", `'${INJECTION}'`)], { cwd: dir });
          if (!name.includes("ANSI")) expect(existsSync(join(dir, "PWNED"))).toBe(true);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
    }

    it("a command with double quotes and a safe value runs normally", () => {
      const line = expandCommandShell(`printf '%s|%s' "a b" {cwd}`, { cwd: "/x y" }, "posix");
      expect(spawnSync(shell, ["-c", line]).stdout.toString()).toBe("a b|/x y");
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

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildScriptInput,
  isSafeScriptCwd,
  planReusedTabInput,
  resolveScriptCwd,
  scriptCwdProblem,
  scriptFolderMissingMessage,
  scriptShellFor,
} from "./scriptCwd";

const base = {
  fixedFolder: "/opt/fixed",
  focusFolder: "/Users/me/project/src",
  workspaceRoot: "/Users/me/project",
  workspaceCwd: "/Users/me/live",
};

describe("resolveScriptCwd", () => {
  it("workspace mode returns the workspace root", () => {
    expect(resolveScriptCwd({ ...base, mode: "workspace" })).toBe(
      "/Users/me/project",
    );
  });

  it("workspace mode falls back to the workspace cwd without a root", () => {
    expect(
      resolveScriptCwd({ ...base, mode: "workspace", workspaceRoot: null }),
    ).toBe("/Users/me/live");
  });

  it("workspace mode is undefined when nothing is known", () => {
    expect(
      resolveScriptCwd({
        mode: "workspace",
        workspaceRoot: null,
        workspaceCwd: null,
      }),
    ).toBeUndefined();
  });

  it("context mode returns the focused folder", () => {
    expect(resolveScriptCwd({ ...base, mode: "context" })).toBe(
      "/Users/me/project/src",
    );
  });

  it("context mode falls back to workspace mode without a focused folder", () => {
    expect(
      resolveScriptCwd({ ...base, mode: "context", focusFolder: null }),
    ).toBe("/Users/me/project");
    expect(
      resolveScriptCwd({
        ...base,
        mode: "context",
        focusFolder: null,
        workspaceRoot: null,
      }),
    ).toBe("/Users/me/live");
  });

  it("fixed mode returns the trimmed fixed folder", () => {
    expect(
      resolveScriptCwd({ ...base, mode: "fixed", fixedFolder: "  /opt/x " }),
    ).toBe("/opt/x");
  });

  it("fixed mode with an empty folder falls back to workspace mode", () => {
    expect(resolveScriptCwd({ ...base, mode: "fixed", fixedFolder: "" })).toBe(
      "/Users/me/project",
    );
    expect(
      resolveScriptCwd({ ...base, mode: "fixed", fixedFolder: "   " }),
    ).toBe("/Users/me/project");
    expect(
      resolveScriptCwd({ ...base, mode: "fixed", fixedFolder: undefined }),
    ).toBe("/Users/me/project");
  });

  it("an empty or blank focus folder counts as absent", () => {
    expect(resolveScriptCwd({ ...base, mode: "context", focusFolder: "" })).toBe(
      "/Users/me/project",
    );
    expect(
      resolveScriptCwd({ ...base, mode: "context", focusFolder: "  " }),
    ).toBe("/Users/me/project");
  });

  it("an absent mode behaves as workspace and ignores the fixed folder", () => {
    expect(resolveScriptCwd({ ...base, mode: undefined })).toBe(
      "/Users/me/project",
    );
  });
});

describe("buildScriptInput", () => {
  it("only the command when there is no folder", () => {
    expect(buildScriptInput("pnpm dev", undefined, "posix")).toBe("pnpm dev\r");
  });

  it("groups the command after && on posix, quoting the path", () => {
    expect(buildScriptInput("pnpm dev", "/a b/it's", "posix")).toBe(
      "cd -- '/a b/it'\\''s' && { pnpm dev\n\n}\r",
    );
  });

  it("keeps $, backtick, double quote and % literal on posix", () => {
    for (const p of ["/a/$HOME", "/a/`x`", '/a/"q"', "/a/%PATH%"]) {
      expect(buildScriptInput("ls", p, "posix")).toBe(
        `cd -- '${p}' && { ls\n\n}\r`,
      );
    }
  });

  it("throws on a path with any control character", () => {
    for (const c of ["\n", "\r", "\t", "\x03", "\x00", "\x1b", "\x7f"]) {
      expect(() => buildScriptInput("ls", `/a${c}b`, "posix")).toThrow();
      expect(() => buildScriptInput("ls", `/a${c}b`, "powershell")).toThrow();
    }
  });

  it("isSafeScriptCwd rejects control characters only", () => {
    expect(isSafeScriptCwd("/a b/\u00e9")).toBe(true);
    expect(isSafeScriptCwd("/a\tb")).toBe(false);
    expect(isSafeScriptCwd("/a\x03b")).toBe(false);
  });

  it("uses a literal Set-Location guarded by $? on powershell", () => {
    expect(buildScriptInput("pnpm dev", "C:/it's [x] $a", "powershell")).toBe(
      "Set-Location -LiteralPath 'C:/it''s [x] $a'; if ($?) { pnpm dev\n\n}\r",
    );
  });

  it("closes the powershell block on its own line so a trailing comment cannot swallow it", () => {
    expect(buildScriptInput("ls # note", "C:/a", "powershell")).toBe(
      "Set-Location -LiteralPath 'C:/a'; if ($?) { ls # note\n\n}\r",
    );
  });

  it("doubles every quote PowerShell treats as a single quote", () => {
    for (const q of ["'", "\u2018", "\u2019", "\u201A", "\u201B"]) {
      expect(buildScriptInput("ls", `C:/a${q}b`, "powershell")).toBe(
        `Set-Location -LiteralPath 'C:/a${q}${q}b'; if ($?) { ls\n\n}\r`,
      );
    }
  });

  it("adds no group when there is no folder", () => {
    expect(buildScriptInput("a; b", undefined, "powershell")).toBe("a; b\r");
  });
});

describe("scriptShellFor", () => {
  it("is powershell only on Windows outside WSL", () => {
    expect(scriptShellFor(true, "local")).toBe("powershell");
    expect(scriptShellFor(true, "wsl")).toBe("posix");
    expect(scriptShellFor(false, "local")).toBe("posix");
    expect(scriptShellFor(false, "wsl")).toBe("posix");
  });
});

const hasBash =
  process.platform !== "win32" &&
  spawnSync("bash", ["-c", "exit 0"]).status === 0;

// Non-interactive bash: it checks grouping and cd semantics, but not what an
// interactive zsh does with a trailing "# comment" (it needs interactive_comments).
describe.skipIf(!hasBash)("posix input run by a non-interactive bash", () => {
  const run = (command: string, cwd: string) => {
    const dir = mkdtempSync(join(tmpdir(), "kex-cwd-"));
    try {
      const input = buildScriptInput(
        command.replace(/@OUT/g, dir),
        cwd,
        "posix",
      ).replace(/\r$/, "\n");
      const res = spawnSync("bash", ["-c", input], { cwd: dir });
      const read = (f: string) =>
        existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "";
      return {
        error: res.error,
        status: res.status,
        ran: read("ran"),
        ranB: read("ranB"),
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const missing = "/definitely/not/here";

  it("runs a compound command when the cd works", () => {
    const r = run("echo a > @OUT/ran; echo b > @OUT/ranB", tmpdir());
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(0);
    expect(r.ran).toBe("a\n");
    expect(r.ranB).toBe("b\n");
  });

  it("runs nothing of a ';' chain when the cd fails", () => {
    const r = run("true; echo b > @OUT/ranB", missing);
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(1);
    expect(r.ranB).toBe("");
  });

  it("runs nothing of a '||' chain when the cd fails", () => {
    const r = run("false || echo b > @OUT/ranB", missing);
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(1);
    expect(r.ranB).toBe("");
  });

  it("runs nothing of a multiline command when the cd fails", () => {
    const r = run("echo a > @OUT/ran\necho b > @OUT/ranB", missing);
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(1);
    expect(r.ran + r.ranB).toBe("");
  });

  it("a trailing comment does not break the group", () => {
    const r = run("echo a > @OUT/ran # note", tmpdir());
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(0);
    expect(r.ran).toBe("a\n");
  });

  it("a trailing backslash does not swallow the closing brace", () => {
    const r = run("echo a > @OUT/ran \\", tmpdir());
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(0);
    expect(r.ran).toBe("a\n");
  });
});

describe("scriptCwdProblem", () => {
  it("accepts absolute posix, drive and UNC folders", () => {
    for (const p of ["/a", "/a b/-x", "C:/a", "C:\\a", "\\\\host\\share"]) {
      expect(scriptCwdProblem(p)).toBeNull();
    }
  });

  it("rejects ~, relative, dash-leading and control-character folders", () => {
    for (const p of ["~", "~/x", "-x", "-", ".", "../x", "x/y", "/a\nb"]) {
      expect(scriptCwdProblem(p)).not.toBeNull();
      expect(() => buildScriptInput("ls", p, "posix")).toThrow();
      expect(() => buildScriptInput("ls", p, "powershell")).toThrow();
    }
  });
});

describe("scriptFolderMissingMessage", () => {
  it("is null for a folder", () => {
    expect(scriptFolderMissingMessage("/a", { kind: "dir" })).toBeNull();
  });

  it("explains a missing folder and a file", () => {
    expect(scriptFolderMissingMessage("/a", null)).toContain("does not exist");
    expect(scriptFolderMissingMessage("/a", { kind: "file" })).toContain("not a folder");
  });
});

const hasShell = (name: string) =>
  process.platform !== "win32" &&
  spawnSync(name, ["-c", "exit 0"]).status === 0;

const awkwardFolders = [
  "it's here",
  "with space",
  "$HOME",
  "back`tick`",
  'double"quote',
  "double\\\\backslash",
  "caf\u00e9 \u65e5\u672c",
  "-dash",
  "trailing\\",
];

for (const shell of ["bash", "zsh"]) {
  describe.skipIf(!hasShell(shell))(`generated input run by ${shell}`, () => {
    for (const name of awkwardFolders) {
      it(`reaches the folder intact: ${JSON.stringify(name)}`, () => {
        const base = mkdtempSync(join(tmpdir(), "kex-quote-"));
        try {
          const folder = join(base, name);
          mkdirSync(folder);
          const out = join(base, "out");
          mkdirSync(out);
          const input = buildScriptInput(
            `pwd -P > ${out}/pwd; echo ran > ${out}/ran`,
            folder,
            "posix",
          ).replace(/\r$/, "\n");
          const res = spawnSync(shell, ["-c", input], { cwd: base });
          expect(res.stderr.toString()).toBe("");
          expect(res.status).toBe(0);
          expect(readFileSync(join(out, "pwd"), "utf8").trimEnd()).toBe(
            realpathSync(folder),
          );
          expect(readFileSync(join(out, "ran"), "utf8")).toBe("ran\n");
        } finally {
          rmSync(base, { recursive: true, force: true });
        }
      });
    }

    it("runs nothing when the folder does not exist", () => {
      const base = mkdtempSync(join(tmpdir(), "kex-quote-"));
      try {
        const input = buildScriptInput(
          `echo ran > ${base}/ran`,
          join(base, "gone"),
          "posix",
        ).replace(/\r$/, "\n");
        const res = spawnSync(shell, ["-c", input], { cwd: base });
        expect(res.status).not.toBe(0);
        expect(existsSync(join(base, "ran"))).toBe(false);
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    });
  });
}

describe("planReusedTabInput", () => {
  it("writes nothing when the tab is busy", () => {
    expect(planReusedTabInput(true, "ls", "/a", "posix")).toBeNull();
  });

  it("cds first on an idle tab whenever a folder resolves", () => {
    expect(planReusedTabInput(false, "ls", "/a", "posix")).toBe(
      "cd -- '/a' && { ls\n\n}\r",
    );
  });

  it("only runs the command on an idle tab without a folder", () => {
    expect(planReusedTabInput(false, "ls", undefined, "posix")).toBe("ls\r");
  });
});

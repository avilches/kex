import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildScriptInput,
  isSafeScriptCwd,
  planReusedTabInput,
  resolveScriptCwd,
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
      "cd '/a b/it'\\''s' && { pnpm dev\n}\r",
    );
  });

  it("keeps $, backtick, double quote and % literal on posix", () => {
    for (const p of ["/a/$HOME", "/a/`x`", '/a/"q"', "/a/%PATH%"]) {
      expect(buildScriptInput("ls", p, "posix")).toBe(
        `cd '${p}' && { ls\n}\r`,
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
      "Set-Location -LiteralPath 'C:/it''s [x] $a'; if ($?) { pnpm dev\n}\r",
    );
  });

  it("closes the powershell block on its own line so a trailing comment cannot swallow it", () => {
    expect(buildScriptInput("ls # note", "C:/a", "powershell")).toBe(
      "Set-Location -LiteralPath 'C:/a'; if ($?) { ls # note\n}\r",
    );
  });

  it("doubles every quote PowerShell treats as a single quote", () => {
    for (const q of ["'", "\u2018", "\u2019", "\u201A", "\u201B"]) {
      expect(buildScriptInput("ls", `C:/a${q}b`, "powershell")).toBe(
        `Set-Location -LiteralPath 'C:/a${q}${q}b'; if ($?) { ls\n}\r`,
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

const hasBash = existsSync("/bin/bash") || existsSync("/usr/bin/bash");
describe.skipIf(!hasBash || process.platform === "win32")(
  "posix input run by a real bash",
  () => {
    const run = (command: string, cwd: string) => {
      const dir = mkdtempSync(join(tmpdir(), "kex-cwd-"));
      try {
        const input = buildScriptInput(
          command.replace(/@OUT/g, dir),
          cwd,
          "posix",
        ).replace(/\r$/, "\n");
        spawnSync("bash", ["-c", input], { cwd: dir });
        const read = (f: string) =>
          existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "";
        return { ran: read("ran"), ranB: read("ranB") };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    const missing = "/definitely/not/here";

    it("runs a compound command when the cd works", () => {
      const r = run("echo a > @OUT/ran; echo b > @OUT/ranB", tmpdir());
      expect(r.ran).toBe("a\n");
      expect(r.ranB).toBe("b\n");
    });

    it("runs nothing of a ';' chain when the cd fails", () => {
      const r = run("true; echo b > @OUT/ranB", missing);
      expect(r.ranB).toBe("");
    });

    it("runs nothing of a '||' chain when the cd fails", () => {
      const r = run("false || echo b > @OUT/ranB", missing);
      expect(r.ranB).toBe("");
    });

    it("runs nothing of a multiline command when the cd fails", () => {
      const r = run("echo a > @OUT/ran\necho b > @OUT/ranB", missing);
      expect(r.ran + r.ranB).toBe("");
    });

    it("a trailing comment does not break the group", () => {
      const r = run("echo a > @OUT/ran # note", tmpdir());
      expect(r.ran).toBe("a\n");
    });
  },
);

describe("planReusedTabInput", () => {
  it("writes nothing when the tab is busy", () => {
    expect(planReusedTabInput(true, "ls", "/a", "posix")).toBeNull();
  });

  it("cds first on an idle tab whenever a folder resolves", () => {
    expect(planReusedTabInput(false, "ls", "/a", "posix")).toBe(
      "cd '/a' && { ls\n}\r",
    );
  });

  it("only runs the command on an idle tab without a folder", () => {
    expect(planReusedTabInput(false, "ls", undefined, "posix")).toBe("ls\r");
  });
});

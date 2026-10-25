import { describe, expect, it } from "vitest";
import {
  equalFolder,
  folderKey,
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

  it("an absent mode behaves as home and ignores the fixed folder", () => {
    expect(resolveScriptCwd({ ...base, mode: undefined, home: "/Users/me" })).toBe("/Users/me");
    expect(resolveScriptCwd({ ...base, mode: "home", home: "/Users/me", fixedFolder: "/x" })).toBe("/Users/me");
  });

  it("home with no known home leaves the folder to the terminal", () => {
    expect(resolveScriptCwd({ ...base, mode: "home" })).toBeUndefined();
    expect(resolveScriptCwd({ ...base, mode: "home", home: "  " })).toBeUndefined();
  });

  it("workspace mode keeps using the workspace folder", () => {
    expect(resolveScriptCwd({ ...base, mode: "workspace", home: "/Users/me" })).toBe("/Users/me/project");
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

describe("scriptCwdProblem", () => {
  it("accepts absolute posix, drive and UNC folders", () => {
    for (const p of ["/a", "/a b/-x", "C:/a", "C:\\a", "\\\\host\\share"]) {
      expect(scriptCwdProblem(p)).toBeNull();
    }
  });

  it("rejects ~, relative, dash-leading and control-character folders", () => {
    for (const p of ["~", "~/x", "-x", "-", ".", "../x", "x/y", "/a\nb"]) {
      expect(scriptCwdProblem(p)).not.toBeNull();
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

describe("folderKey and equalFolder", () => {
  it("keeps a backslash on a POSIX path as part of a name", () => {
    expect(equalFolder("/x/a\\b", "/x/a/b")).toBe(false);
    expect(folderKey("/x/a\\b")).toBe("/x/a\\b");
  });

  it("folds separators and case on a drive or UNC path, and the trailing separator everywhere", () => {
    expect(equalFolder("C:\\Work\\App", "c:/work/app/")).toBe(true);
    expect(equalFolder("\\\\Host\\Share\\A", "\\\\host/share/a")).toBe(true);
    expect(equalFolder("/x/a/", "/x/a")).toBe(true);
  });
});

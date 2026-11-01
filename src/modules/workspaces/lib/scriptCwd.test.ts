import { describe, expect, it } from "vitest";
import {
  equalFolder,
  folderKey,
  scriptCwdProblem,
  scriptFolderMissingMessage,
  scriptShellFor,
} from "./scriptCwd";

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

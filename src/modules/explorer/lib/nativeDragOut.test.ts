import { beforeEach, describe, expect, it, vi } from "vitest";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { isOwnNativeDrag, pointerLeftWindow, startNativeFileDrag, tabNativeDragPath } from "@/modules/explorer/lib/nativeDragOut";
import type { Tab } from "@/modules/workspaces/lib/types";

vi.mock("@crabnebula/tauri-plugin-drag", () => ({ startDrag: vi.fn() }));

describe("isOwnNativeDrag", () => {
  beforeEach(() => {
    vi.mocked(startDrag).mockReset();
  });

  it("recognises the paths it handed to the OS, with either separator", async () => {
    vi.mocked(startDrag).mockResolvedValue(undefined);
    await startNativeFileDrag("C:/a/b.txt", Promise.resolve("data:image/png;base64,x"));
    expect(isOwnNativeDrag(["C:\\a\\b.txt"])).toBe(true);
    expect(isOwnNativeDrag(["C:/a/b.txt"])).toBe(true);
  });

  it("does not claim a drop with other or no paths", async () => {
    vi.mocked(startDrag).mockResolvedValue(undefined);
    await startNativeFileDrag("/a/b.txt", Promise.resolve("data:image/png;base64,x"));
    expect(isOwnNativeDrag(["/a/other.txt"])).toBe(false);
    expect(isOwnNativeDrag(["/a/b.txt", "/a/other.txt"])).toBe(false);
    expect(isOwnNativeDrag([])).toBe(false);
  });

  it("forgets the paths when the drag fails to start", async () => {
    vi.mocked(startDrag).mockRejectedValue(new Error("boom"));
    await expect(startNativeFileDrag("/a/b.txt", Promise.resolve("data:image/png;base64,x"))).rejects.toThrow("boom");
    expect(isOwnNativeDrag(["/a/b.txt"])).toBe(false);
  });
});

describe("pointerLeftWindow", () => {
  it("is false inside the window, edges included on the near side", () => {
    expect(pointerLeftWindow(0, 0, 100, 50)).toBe(false);
    expect(pointerLeftWindow(99, 49, 100, 50)).toBe(false);
  });

  it("is true past any edge", () => {
    expect(pointerLeftWindow(-1, 10, 100, 50)).toBe(true);
    expect(pointerLeftWindow(10, -1, 100, 50)).toBe(true);
    expect(pointerLeftWindow(100, 10, 100, 50)).toBe(true);
    expect(pointerLeftWindow(10, 50, 100, 50)).toBe(true);
  });
});

describe("tabNativeDragPath", () => {
  const common = { id: "tab-1", title: "t" };

  it("returns the absolute path of editor and markdown tabs", () => {
    expect(tabNativeDragPath({ ...common, kind: "markdown", path: "/a/b.md" } as Tab)).toBe("/a/b.md");
    expect(tabNativeDragPath({ ...common, kind: "editor", path: "/a/b.ts" } as Tab)).toBe("/a/b.ts");
  });

  it("refuses tabs that are not a file on disk", () => {
    expect(tabNativeDragPath({ ...common, kind: "terminal" } as Tab)).toBeNull();
    expect(
      tabNativeDragPath({ ...common, kind: "git-commit-file", repoRoot: "/r", sha: "abc", path: "f", originalPath: null, preview: false } as Tab),
    ).toBeNull();
  });
});

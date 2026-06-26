import { describe, expect, it, vi } from "vitest";
import { dispatchRevealAction } from "./pendingAction";

describe("dispatchRevealAction", () => {
  const handlers = () => ({
    beginRename: vi.fn(),
    beginDuplicate: vi.fn(),
    requestDelete: vi.fn(),
  });

  it("rename calls beginRename with the path", () => {
    const h = handlers();
    dispatchRevealAction("rename", "/a/b.ts", false, h);
    expect(h.beginRename).toHaveBeenCalledWith("/a/b.ts");
  });

  it("duplicate passes the kind", () => {
    const h = handlers();
    dispatchRevealAction("duplicate", "/a/dir", true, h);
    expect(h.beginDuplicate).toHaveBeenCalledWith("/a/dir", "dir");
    dispatchRevealAction("duplicate", "/a/f.ts", false, h);
    expect(h.beginDuplicate).toHaveBeenCalledWith("/a/f.ts", "file");
  });

  it("delete forwards isDir", () => {
    const h = handlers();
    dispatchRevealAction("delete", "/a/dir", true, h);
    expect(h.requestDelete).toHaveBeenCalledWith("/a/dir", true);
  });
});

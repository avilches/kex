import { beforeEach, describe, expect, it, vi } from "vitest";

const glob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/native", () => ({ native: { glob } }));

import { markdownIndex, markdownIndexAdd, reloadMarkdownIndex } from "./mdIndex";

const hits = (...paths: string[]) => ({ hits: paths.map((path) => ({ path })) });
let n = 0;
const freshRoot = () => `/root-${n++}`;

beforeEach(() => {
  glob.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("markdownIndexAdd", () => {
  it("gives the hosts a new array, so a state update with it is not a no-op", async () => {
    const root = freshRoot();
    glob.mockResolvedValue(hits("/a.md"));
    const before = await markdownIndex(root);
    markdownIndexAdd(root, "/b.md");
    const after = await markdownIndex(root);
    expect(after).not.toBe(before);
    expect(before).toEqual(["/a.md"]);
    expect(after).toEqual(["/a.md", "/b.md"]);
  });

  it("keeps a note added while the glob was still running", async () => {
    const root = freshRoot();
    let finish: (v: unknown) => void = () => {};
    glob.mockReturnValue(new Promise((r) => (finish = r)));
    const pending = markdownIndex(root);
    markdownIndexAdd(root, "/new.md");
    finish(hits("/a.md"));
    expect(await pending).toEqual(["/a.md", "/new.md"]);
  });
});

describe("a failed glob", () => {
  it("is asked again by the next surface instead of staying cached", async () => {
    const root = freshRoot();
    glob.mockRejectedValueOnce(new Error("boom"));
    expect(await markdownIndex(root)).toEqual([]);
    glob.mockResolvedValueOnce(hits("/a.md"));
    expect(await markdownIndex(root)).toEqual(["/a.md"]);
    expect(glob).toHaveBeenCalledTimes(2);
  });

  it("a reload replaces the cached list", async () => {
    const root = freshRoot();
    glob.mockResolvedValueOnce(hits("/a.md"));
    await markdownIndex(root);
    glob.mockResolvedValueOnce(hits("/a.md", "/c.md"));
    expect(await reloadMarkdownIndex(root)).toEqual(["/a.md", "/c.md"]);
  });
});

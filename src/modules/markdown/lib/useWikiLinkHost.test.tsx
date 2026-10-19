// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const glob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/native", () => ({ native: { glob } }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }) }));
vi.mock("@/modules/explorer/lib/contextActions", () => ({
  relativePath: (root: string, path: string) => path.slice(root.length + 1),
}));

import { EditorChromeProvider } from "@/modules/workspaces/EditorChromeContext";
import { useWikiLinkHost } from "./useWikiLinkHost";

// The module-level mdIndex cache is shared by all hook instances, so every
// test runs against its own workspace root to keep the cache isolated.
function renderHost(root: string, currentPath: string, openFile: (p: string) => void) {
  const utils = renderHook(
    (args: { open: (p: string) => void; path: string }) =>
      useWikiLinkHost(args.path, args.open, () => false),
    {
      initialProps: { open: openFile, path: currentPath },
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <EditorChromeProvider value={{ explorerRoot: root, workspaceRoot: root, home: null, gitRootPath: null }}>
          {children}
        </EditorChromeProvider>
      ),
    },
  );
  return utils;
}

afterEach(() => {
  glob.mockReset();
});

describe("useWikiLinkHost", () => {
  it("keeps the host identity across app-level rerenders that only change onOpenFile", async () => {
    glob.mockResolvedValue({ hits: [{ path: "/r1/notes/a.md" }] });
    const { result, rerender } = renderHost("/r1", "/r1/notes/a.md", vi.fn());
    await waitFor(() => expect(result.current?.resolve("a")).not.toBeNull());
    const host = result.current;
    act(() => {
      rerender({ open: vi.fn(), path: "/r1/notes/a.md" });
    });
    expect(result.current).toBe(host);
  });

  it("rebuilds the host only through currentPath even when the file changes within the root", async () => {
    glob.mockResolvedValue({ hits: [{ path: "/r2/notes/a.md" }] });
    const { result, rerender } = renderHost("/r2", "/r2/notes/a.md", vi.fn());
    await waitFor(() => expect(result.current?.resolve("a")).not.toBeNull());
    const host = result.current;
    act(() => {
      rerender({ open: vi.fn(), path: "/r2/notes/renamed.md" });
    });
    expect(result.current).not.toBe(host);
    await waitFor(() => expect(result.current?.resolve("a")).not.toBeNull());
    expect(glob).toHaveBeenCalledTimes(1);
  });

  it("re-lists when the root changes", async () => {
    glob
      .mockResolvedValueOnce({ hits: [{ path: "/r3/a.md" }] })
      .mockResolvedValue({ hits: [{ path: "/r3out/x.md" }] });
    const { result, rerender } = renderHost("/r3", "/r3/a.md", vi.fn());
    await waitFor(() => expect(result.current?.resolve("a")).not.toBeNull());
    const host = result.current;
    act(() => {
      rerender({ open: vi.fn(), path: "/r3out/x.md" });
    });
    await waitFor(() => expect(result.current?.resolve("x")).not.toBeNull());
    expect(result.current).not.toBe(host);
    expect(glob).toHaveBeenCalledTimes(2);
  });

  it("shares one glob per root across two hook instances", async () => {
    glob.mockResolvedValue({ hits: [{ path: "/r4/notes/a.md" }] });
    const first = renderHost("/r4", "/r4/notes/a.md", vi.fn());
    await waitFor(() => expect(first.result.current?.resolve("a")).not.toBeNull());
    const second = renderHost("/r4", "/r4/notes/other.md", vi.fn());
    await waitFor(() => expect(second.result.current?.resolve("a")).not.toBeNull());
    expect(glob).toHaveBeenCalledTimes(1);
  });

  it("ignores a slow index response for a root the hook has moved away from", async () => {
    let releaseSlow!: (v: { hits: { path: string }[] }) => void;
    const slow = new Promise<{ hits: { path: string }[] }>((resolve) => {
      releaseSlow = resolve;
    });
    glob
      .mockImplementationOnce(() => slow)
      .mockResolvedValue({ hits: [{ path: "/r6out/fast.md" }] });
    const { result, rerender } = renderHost("/r5", "/r5/a.md", vi.fn());
    await waitFor(() => expect(result.current).toBeDefined());
    const host = result.current;
    act(() => {
      rerender({ open: vi.fn(), path: "/r6out/x.md" });
    });
    expect(result.current).not.toBe(host);
    await waitFor(() => expect(result.current?.resolve("fast")).not.toBeNull());
    act(() => {
      releaseSlow({ hits: [{ path: "/r5/slow-a.md" }] });
    });
    await act(async () => {
      await slow;
    });
    expect(result.current?.resolve("slow-a")).toBeNull();
    expect(result.current?.resolve("fast")).toBe("/r6out/fast.md");
  });
});

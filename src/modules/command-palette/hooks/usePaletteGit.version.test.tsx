// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolve = vi.fn();
vi.mock("@/lib/native", () => ({ native: { gitResolveRepo: (d: string) => resolve(d) } }));

import { _resetDirGitStore, demandDir } from "@/modules/workspaces/lib/dirGitStore";
import { usePaletteGit } from "./usePaletteGit";

const flush = () => new Promise((r) => setTimeout(r, 0));
const info = (branch: string) => ({ repoRoot: "/r", branch, upstream: null, isDetached: false, isWorktree: false });

let seen: number[] = [];
function Probe({ open, dirs }: { open: boolean; dirs: string[] }) {
  seen.push(usePaletteGit(open, dirs));
  return null;
}

beforeEach(() => {
  _resetDirGitStore();
  resolve.mockReset();
  seen = [];
});
afterEach(cleanup);

describe("usePaletteGit as a hook", () => {
  it("asks for the directories only while open, and releases them on close", async () => {
    resolve.mockResolvedValue(info("main"));
    const { rerender } = render(<Probe open dirs={["/r/a"]} />);
    await act(flush);
    expect(resolve).toHaveBeenCalledTimes(1);
    rerender(<Probe open={false} dirs={["/r/a"]} />);
    resolve.mockClear();
    window.dispatchEvent(new Event("focus"));
    await act(flush);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("changes its version when a branch arrives, so entries are rebuilt", async () => {
    resolve.mockResolvedValue(info("main"));
    render(<Probe open dirs={["/r/a"]} />);
    const before = seen[0];
    await act(flush);
    expect(seen[seen.length - 1]).toBeGreaterThan(before);
  });

  it("does not keep asking after unmount, even under StrictMode double mounting", async () => {
    resolve.mockResolvedValue(info("main"));
    const { unmount } = render(
      <StrictMode>
        <Probe open dirs={["/r/a"]} />
      </StrictMode>,
    );
    await act(flush);
    unmount();
    resolve.mockClear();
    window.dispatchEvent(new Event("focus"));
    await act(flush);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("does not disturb another consumer of the same directory", async () => {
    resolve.mockResolvedValue(info("main"));
    const release = demandDir("/r/a");
    const { unmount } = render(<Probe open dirs={["/r/a"]} />);
    await act(flush);
    unmount();
    resolve.mockClear();
    window.dispatchEvent(new Event("focus"));
    await act(flush);
    expect(resolve).toHaveBeenCalledTimes(1);
    release();
  });

  it("keeps working after being unmounted and mounted again", async () => {
    resolve.mockResolvedValue(info("main"));
    const first = render(<Probe open dirs={["/r/a"]} />);
    await act(flush);
    first.unmount();
    seen = [];
    resolve.mockResolvedValue(info("dev"));
    render(<Probe open dirs={["/r/b"]} />);
    const before = seen[0];
    await act(flush);
    expect(seen[seen.length - 1]).toBeGreaterThan(before);
  });
});

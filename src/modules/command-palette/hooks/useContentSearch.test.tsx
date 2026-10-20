// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock("@/modules/workspace", () => ({ currentWorkspaceEnv: () => null }));

import { useContentSearch } from "./useContentSearch";

function Probe({ term, enabled }: { term: string; enabled: boolean }) {
  useContentSearch("/root", term, enabled);
  return null;
}

function pendingSearch() {
  invoke.mockImplementation((command: string) => {
    if (command === "fs_grep_interactive") return new Promise(() => {});
    return Promise.resolve();
  });
}

function searchRequestId(): number {
  for (const [command, params] of invoke.mock.calls) {
    if (command === "fs_grep_interactive") {
      return (params as { requestId: number }).requestId;
    }
  }
  throw new Error("fs_grep_interactive was never invoked");
}

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useContentSearch cancellation", () => {
  it("cancels the in-flight search when the term changes", async () => {
    pendingSearch();
    const { rerender } = render(<Probe term="fi" enabled />);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    const requestId = searchRequestId();

    rerender(<Probe term="fix" enabled />);
    await act(async () => {});

    expect(invoke).toHaveBeenCalledWith("fs_grep_cancel", { requestId });
  });

  it("cancels the in-flight search when the palette closes", async () => {
    pendingSearch();
    const { rerender } = render(<Probe term="fi" enabled />);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    const requestId = searchRequestId();

    rerender(<Probe term="fi" enabled={false} />);
    await act(async () => {});

    expect(invoke).toHaveBeenCalledWith("fs_grep_cancel", { requestId });
  });
});

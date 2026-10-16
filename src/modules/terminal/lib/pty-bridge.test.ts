import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn(async (_cmd: string, _args: unknown): Promise<unknown> => undefined);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args: unknown) => invokeMock(cmd, args),
  Channel: class<T> {
    onmessage: ((message: T) => void) | undefined;
  },
}));

import { openPty } from "./pty-bridge";

const handlers = {
  onData: () => {},
  onExit: () => {},
};

describe("openPty", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("surfaces the folder the shell started in from the pty_open response", async () => {
    invokeMock.mockResolvedValue({ id: 7, cwd: "/repo" });
    const session = await openPty(80, 24, handlers, "/repo");
    expect(session.id).toBe(7);
    expect(session.cwd).toBe("/repo");
    expect(invokeMock).toHaveBeenCalledWith(
      "pty_open",
      expect.objectContaining({ cols: 80, rows: 24, cwd: "/repo" }),
    );
  });

  it("keeps cwd null when the response carries no folder", async () => {
    invokeMock.mockResolvedValue({ id: 9, cwd: null });
    const session = await openPty(80, 24, handlers);
    expect(session.cwd).toBeNull();
  });
});
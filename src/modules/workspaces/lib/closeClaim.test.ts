import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimClose,
  handleBeforeQuit,
  pendingCloseFlush,
  releaseClose,
  trackCloseFlush,
} from "./closeClaim";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("closeClaim", () => {
  afterEach(() => {
    releaseClose();
  });

  it("hands the claim to a single caller until it is released", () => {
    expect(claimClose()).toBe(true);
    expect(claimClose()).toBe(false);
    releaseClose();
    expect(claimClose()).toBe(true);
  });

  it("forgets the tracked flush when the claim is released", () => {
    claimClose();
    trackCloseFlush(Promise.resolve());
    expect(pendingCloseFlush()).not.toBeNull();
    releaseClose();
    expect(pendingCloseFlush()).toBeNull();
  });
});

describe("handleBeforeQuit", () => {
  afterEach(() => {
    releaseClose();
  });

  it("flushes and then confirms when nothing is closing", async () => {
    const order: string[] = [];
    await handleBeforeQuit(
      async () => {
        order.push("flush");
      },
      async () => {
        order.push("confirm");
      },
    );
    expect(order).toEqual(["flush", "confirm"]);
  });

  it("waits for a flush that is already in flight instead of confirming at once", async () => {
    const inFlight = deferred();
    expect(claimClose()).toBe(true);
    trackCloseFlush(inFlight.promise);

    const flush = vi.fn(async () => {});
    const confirm = vi.fn(async () => {});
    const quit = handleBeforeQuit(flush, confirm);
    await Promise.resolve();
    await Promise.resolve();
    expect(confirm).not.toHaveBeenCalled();

    inFlight.resolve();
    await quit;
    expect(flush).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("still confirms when the flush it waited for fails", async () => {
    const inFlight = deferred();
    claimClose();
    trackCloseFlush(inFlight.promise);
    const confirm = vi.fn(async () => {});
    const quit = handleBeforeQuit(async () => {}, confirm);
    inFlight.reject(new Error("disk full"));
    await quit;
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("confirms the quit and frees the claim when its own flush fails", async () => {
    const confirm = vi.fn(async () => {});
    await handleBeforeQuit(async () => {
      throw new Error("disk full");
    }, confirm);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(claimClose()).toBe(true);
  });

  it("frees the claim after a successful flush so a cancelled quit can flush again", async () => {
    await handleBeforeQuit(
      async () => {},
      async () => {},
    );
    expect(claimClose()).toBe(true);
  });
});

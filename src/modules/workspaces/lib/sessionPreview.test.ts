import { describe, expect, it } from "vitest";
import {
  describeSessionPreview,
  previewRequestKey,
  tildePath,
} from "./sessionPreview";

const HOME = "/Users/me";
const NOW = 1_000_000_000_000;

describe("tildePath", () => {
  it("abbreviates the home folder and nothing that only shares its prefix", () => {
    expect(tildePath("/Users/me/code/kex", HOME)).toBe("~/code/kex");
    expect(tildePath("/Users/me", HOME)).toBe("~");
    expect(tildePath("/Users/meta/x", HOME)).toBe("/Users/meta/x");
    expect(tildePath("C:\\Users\\me\\x", "C:/Users/me")).toBe("~/x");
    expect(tildePath("/tmp", null)).toBe("/tmp");
  });
});

describe("describeSessionPreview", () => {
  it("shows the message, the folder and how long ago the turn ended", () => {
    const line = describeSessionPreview(
      {
        tabId: "t",
        cwd: "/Users/me/code/kex",
        lastMessage: "All tests pass.",
        updatedAt: NOW / 1000 - 3 * 3600,
      },
      NOW,
      HOME,
    );
    expect(line.message).toBe("All tests pass.");
    expect(line.meta).toBe("~/code/kex \u00b7 3h ago");
    expect(line.metaTitle.startsWith("/Users/me/code/kex\n")).toBe(true);
  });

  it("tolerates a session whose agent never sent a message", () => {
    for (const lastMessage of [undefined, null, "", "   "]) {
      const line = describeSessionPreview(
        { tabId: "t", cwd: "/p", lastMessage, updatedAt: NOW / 1000 },
        NOW,
        HOME,
      );
      expect(line.message).toBeNull();
      expect(line.meta).toBe("/p \u00b7 less than a minute ago");
    }
  });

  it("leaves out a time it does not know", () => {
    const line = describeSessionPreview(
      { tabId: "t", cwd: "/p", updatedAt: 0 },
      NOW,
      HOME,
    );
    expect(line.meta).toBe("/p");
    expect(line.metaTitle).toBe("/p");
  });
});

describe("previewRequestKey", () => {
  it("does not change with the order of the tabs", () => {
    expect(previewRequestKey(["b", "a"])).toBe(previewRequestKey(["a", "b"]));
    expect(previewRequestKey([])).toBe("");
  });
});

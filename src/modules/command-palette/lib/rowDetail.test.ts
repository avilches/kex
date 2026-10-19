import { describe, expect, it } from "vitest";
import { shortLocation, tabRowDetail } from "./rowDetail";
import type { TabEntry } from "./tabEntries";

const entry = (over: Partial<TabEntry> = {}): TabEntry => ({
  tabId: "tab-1",
  workspaceId: "ws-1",
  workspaceTitle: "Work",
  hibernated: false,
  kind: "terminal",
  title: "zsh",
  note: null,
  cwd: "/p/Kex",
  detail: "/p/Kex",
  worktree: "",
  branch: "",
  process: "",
  indicator: null,
  tab: { id: "tab-1", kind: "terminal" },
  agentSession: undefined,
  running: false,
  lastUsedAt: 0,
  workspaceActiveAt: 0,
  order: 0,
  ...over,
});

describe("shortLocation", () => {
  it("keeps the last two folders", () => {
    expect(shortLocation(entry({ detail: "/p/Kex/src" }))).toBe("Kex/src");
  });
  it("strips the protocol of a browser url", () => {
    expect(shortLocation(entry({ kind: "browser", detail: "https://example.com/docs" }))).toBe(
      "example.com/docs",
    );
  });
});

describe("tabRowDetail", () => {
  it("adds nothing when the title already says the folder and the branch", () => {
    expect(tabRowDetail(entry({ title: "Kex · main", detail: "/p/Kex", branch: "main" }), false)).toBeNull();
  });

  it("shows the folder the title does not carry", () => {
    expect(tabRowDetail(entry({ title: "zsh", detail: "/p/Kex/src" }), false)).toEqual({
      location: "Kex/src",
      branch: "",
    });
  });

  it("shows only the branch when the title already names the folder", () => {
    expect(tabRowDetail(entry({ title: "Kex", detail: "/p/Kex", branch: "feature" }), false)).toEqual({
      location: "",
      branch: "feature",
    });
  });

  it("always shows the locator for an ambiguous title", () => {
    expect(tabRowDetail(entry({ title: "Kex/src", detail: "/p/Kex/src" }), true)).toEqual({
      location: "Kex/src",
      branch: "",
    });
  });

  it("drops a browser url the title already shows", () => {
    expect(
      tabRowDetail(entry({ kind: "browser", title: "example.com/docs", detail: "https://example.com/docs" }), false),
    ).toBeNull();
  });
});

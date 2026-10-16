// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TabEntry } from "./lib/tabEntries";
import { TabPreview, hasPreview } from "./TabPreview";

vi.mock("@/modules/markdown/MarkdownPreviewPane", () => ({
  MarkdownPreviewPane: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
}));

afterEach(cleanup);

const entry = (over: Partial<TabEntry> = {}): TabEntry => ({
  tabId: "tab-1",
  workspaceId: "ws-1",
  workspaceTitle: "Work",
  hibernated: false,
  kind: "terminal",
  title: "zsh",
  note: null,
  cwd: "",
  worktree: "",
  branch: "",
  process: "",
  indicator: null,
  lastUsedAt: 0,
  workspaceActiveAt: 0,
  order: 0,
  ...over,
});

describe("hasPreview", () => {
  it("is false with no note, cwd or branch", () => {
    expect(hasPreview(entry())).toBe(false);
  });
  it("is true with any of them", () => {
    expect(hasPreview(entry({ note: "x" }))).toBe(true);
    expect(hasPreview(entry({ cwd: "/p" }))).toBe(true);
    expect(hasPreview(entry({ branch: "main" }))).toBe(true);
  });
});

describe("TabPreview", () => {
  it("renders the note and the location", async () => {
    render(<TabPreview entry={entry({ note: "# todo", cwd: "/p/Kex", branch: "main", worktree: "wt1" })} />);
    expect(await screen.findByTestId("md")).toBeTruthy();
    expect(screen.getByText("/p/Kex")).toBeTruthy();
    expect(screen.getByText("main")).toBeTruthy();
    expect(screen.getByText("wt1")).toBeTruthy();
  });

  it("shows only the location when there is no note", () => {
    render(<TabPreview entry={entry({ cwd: "/p/Kex" })} />);
    expect(screen.queryByTestId("md")).toBeNull();
    expect(screen.getByText("/p/Kex")).toBeTruthy();
  });
});

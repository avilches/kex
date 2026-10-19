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
  detail: "",
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

describe("hasPreview", () => {
  it("is false with no note, even with a cwd or a branch", () => {
    expect(hasPreview(entry())).toBe(false);
    expect(hasPreview(entry({ cwd: "/p", branch: "main" }))).toBe(false);
  });
  it("is true with a note", () => {
    expect(hasPreview(entry({ note: "x" }))).toBe(true);
  });
});

describe("TabPreview", () => {
  it("renders the note", async () => {
    render(<TabPreview entry={entry({ note: "# todo", cwd: "/p/Kex", branch: "main" })} />);
    expect(await screen.findByTestId("md")).toBeTruthy();
  });

  it("does not repeat the directory or the branch, which live in the row", () => {
    render(<TabPreview entry={entry({ note: "# todo", cwd: "/p/Kex", branch: "main", worktree: "wt1" })} />);
    expect(screen.queryByText("/p/Kex")).toBeNull();
    expect(screen.queryByText("main")).toBeNull();
    expect(screen.queryByText("wt1")).toBeNull();
  });
});

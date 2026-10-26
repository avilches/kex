// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Command, CommandList } from "@/components/ui/command";
import type { TabEntry } from "./lib/tabEntries";
import { TabItem } from "./TabItem";

afterEach(cleanup);

const entry = (over: Partial<TabEntry> = {}): TabEntry => ({
  tabId: "tab-1",
  workspaceId: "ws-1",
  workspaceTitle: "Work",
  workspaceColor: null,
  workspaceIcon: null,
  hibernated: false,
  kind: "terminal",
  title: "zsh",
  note: null,
  cwd: "/p/Kex",
  detail: "",
  worktree: "",
  branch: "",
  process: "",
  command: "",
  agent: "",
  indicator: null,
  tab: { id: "tab-1", kind: "terminal" },
  agentSession: undefined,
  running: false,
  lastUsedAt: 0,
  order: 0,
  ...over,
});

function row(e: TabEntry) {
  return render(
    <Command>
      <CommandList>
        <TabItem entry={e} onRun={vi.fn()} />
      </CommandList>
    </Command>,
  );
}

describe("TabItem", () => {
  it("shows title and workspace", () => {
    row(entry());
    expect(screen.getByText("zsh")).toBeTruthy();
    expect(screen.getByText("Work")).toBeTruthy();
  });

  it("shows the process and the branch under the path, or beside it when only one exists", () => {
    row(entry({ detail: "/p/Kex", command: "top -o cpu", branch: "main" }));
    expect(screen.getByText("top · main")).toBeTruthy();
    cleanup();
    row(entry({ detail: "/p/Kex", branch: "main" }));
    expect(screen.getByText("/p/Kex · main")).toBeTruthy();
  });

  it("labels the row by what the tab holds", () => {
    row(entry());
    expect(screen.getByText("Terminal")).toBeTruthy();
    cleanup();
    row(entry({ kind: "markdown" }));
    expect(screen.getByText("File")).toBeTruthy();
    cleanup();
    row(entry({ agent: "claude" }));
    expect(screen.getByText("Agent")).toBeTruthy();
  });

  it("shows a spinner only while the agent works", () => {
    row(entry({ indicator: "working" }));
    expect(screen.getByRole("status")).toBeTruthy();
    cleanup();
    row(entry({ indicator: null }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("never shows an autofocus marker", () => {
    row(entry({ note: "hi" }));
    expect(screen.queryByLabelText(/autofocus/i)).toBeNull();
  });

  it("falls back to the kind label when the title is empty", () => {
    row(entry({ kind: "browser", title: "", cwd: "", tab: { id: "tab-1", kind: "browser", url: "" } }));
    expect(screen.getAllByText("Browser")).toHaveLength(2);
  });

  it("marks a hibernated tab", () => {
    row(entry({ hibernated: true }));
    expect(screen.getByLabelText("Tab is hibernated")).toBeTruthy();
  });

  it("shows the absolute path on the second line", () => {
    row(entry({ detail: "/p/Kex/src" }));
    expect(screen.getByText("/p/Kex/src")).toBeTruthy();
  });

  it("shows the url without protocol for a browser tab", () => {
    row(
      entry({
        kind: "browser",
        cwd: "",
        detail: "https://example.com/docs",
        tab: { id: "tab-1", kind: "browser", url: "https://example.com/docs" },
      }),
    );
    expect(screen.getByText("example.com/docs")).toBeTruthy();
  });

  it("shows the note as a third line when the tab has one", () => {
    row(entry({ note: "## Todo\n\nbuy milk" }));
    expect(screen.getByText("## Todo buy milk")).toBeTruthy();
  });
});

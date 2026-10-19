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
  hibernated: false,
  kind: "terminal",
  title: "zsh",
  note: null,
  cwd: "/p/Kex",
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

function row(e: TabEntry, ambiguous = false) {
  return render(
    <Command>
      <CommandList>
        <TabItem entry={e} ambiguous={ambiguous} onRun={vi.fn()} />
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

  it("labels the row as a Tab", () => {
    row(entry());
    expect(screen.getByText("Tab")).toBeTruthy();
  });

  it("shows a spinner only while the agent works", () => {
    row(entry({ indicator: "working" }));
    expect(screen.getByRole("status")).toBeTruthy();
    cleanup();
    row(entry({ indicator: null }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the note icon only when the tab has a note", () => {
    row(entry({ note: "hi" }));
    expect(screen.getByLabelText("Has a note")).toBeTruthy();
    cleanup();
    row(entry({ note: null }));
    expect(screen.queryByLabelText("Has a note")).toBeNull();
  });

  it("never shows an autofocus marker", () => {
    row(entry({ note: "hi" }));
    expect(screen.queryByLabelText(/autofocus/i)).toBeNull();
  });

  it("falls back to the kind label when the title is empty", () => {
    row(entry({ kind: "browser", title: "", cwd: "", tab: { id: "tab-1", kind: "browser", url: "" } }));
    expect(screen.getByText("Browser")).toBeTruthy();
  });

  it("marks a hibernated tab", () => {
    row(entry({ hibernated: true }));
    expect(screen.getByLabelText("Workspace is hibernated")).toBeTruthy();
  });

  it("shows the short cwd under an ambiguous title", () => {
    row(entry({ cwd: "/p/Kex/src", detail: "/p/Kex/src" }), true);
    expect(screen.getByText("Kex/src")).toBeTruthy();
  });

  it("shows the url without protocol under an ambiguous browser title", () => {
    row(
      entry({
        kind: "browser",
        cwd: "",
        detail: "https://example.com/docs",
        tab: { id: "tab-1", kind: "browser", url: "https://example.com/docs" },
      }),
      true,
    );
    expect(screen.getByText("example.com/docs")).toBeTruthy();
  });
});

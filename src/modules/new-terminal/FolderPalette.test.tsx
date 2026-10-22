// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FolderPalette } from "./FolderPalette";
import type { FolderGroup, FolderRow } from "./lib/folderEntries";

const row = (over: Partial<FolderRow> = {}): FolderRow => ({
  key: over.key ?? `${over.workspaceId ?? "ws-1"}:${over.path ?? "/repo"}`,
  path: over.path ?? "/repo",
  display: over.display ?? over.path ?? "/repo",
  displayShift: over.displayShift ?? 0,
  label: over.label ?? null,
  branch: over.branch ?? null,
  repoKey: over.repoKey ?? null,
  hiddenWorktrees: over.hiddenWorktrees ?? 0,
  matchOffset: over.matchOffset ?? 0,
  workspaceId: over.workspaceId ?? "ws-1",
  hibernated: over.hibernated ?? false,
});

const group = (over: Partial<FolderGroup> = {}): FolderGroup => ({
  workspaceId: over.workspaceId ?? "ws-1",
  workspaceTitle: over.workspaceTitle ?? "Kex",
  workspaceColor: over.workspaceColor ?? null,
  workspaceIcon: over.workspaceIcon ?? null,
  active: over.active ?? false,
  hibernated: over.hibernated ?? false,
  rows: over.rows ?? [],
});

const groups: FolderGroup[] = [
  group({
    workspaceId: "ws-1",
    workspaceTitle: "Kex",
    active: true,
    rows: [
      row({ path: "/repo/.claude/worktrees/perf-lab/src-tauri", label: "Current tab", branch: "feat/perf", key: "ws-1:/repo/.claude/worktrees/perf-lab/src-tauri" }),
      row({ path: "/repo", label: "Workspace Root", key: "ws-1:/repo" }),
      row({ path: "/repo/src", branch: "main", key: "ws-1:/repo/src" }),
    ],
  }),
  group({
    workspaceId: "ws-2",
    workspaceTitle: "Dotfiles",
    workspaceColor: "#4f8fff",
    rows: [row({ path: "/dotfiles", label: "Workspace Root", key: "ws-2:/dotfiles" })],
  }),
];

async function settle(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
    await new Promise((r) => requestAnimationFrame(r));
  });
}

function inputEl(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>('[cmdk-input=""]');
  if (!el) throw new Error("palette input not mounted");
  return el;
}

function itemEls(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[cmdk-item=""]')];
}

function mount(onPick: (row: FolderRow) => void) {
  return render(
    createElement(FolderPalette, {
      open: true,
      onOpenChange: vi.fn(),
      groups,
      onPick,
      onExpand: vi.fn(),
    }),
  );
}

describe("FolderPalette", () => {
  afterEach(() => cleanup());

  it("renders the groups in order with paths and notes", async () => {
    const onPick = vi.fn();
    mount(onPick);
    await settle();
    const text = document.body.textContent ?? "";
        expect(text).toContain("/repo/.claude/worktrees/perf-lab/src-tauri");
    expect(text).toContain("Current tab");
    expect(text).toContain("Dotfiles");
    expect(itemEls()).toHaveLength(4);
  });

  it("filters by path and picks the row under the search", async () => {
    const onPick = vi.fn();
    mount(onPick);
    await settle();
    await act(async () => {
      fireEvent.change(inputEl(), { target: { value: "src-tauri" } });
    });
    await settle();
    const visible = itemEls();
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toContain("/repo/.claude/worktrees/perf-lab/src-tauri");
    await act(async () => {
      fireEvent.keyDown(inputEl(), { key: "Enter" });
    });
    await settle();
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/repo/.claude/worktrees/perf-lab/src-tauri",
        workspaceId: "ws-1",
      }),
    );
  });

  it("drops groups with no matching rows", async () => {
    const onPick = vi.fn();
    mount(onPick);
    await settle();
    await act(async () => {
      fireEvent.change(inputEl(), { target: { value: "dotfiles" } });
    });
    await settle();
    const visible = itemEls();
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toContain("/dotfiles");
    expect(visible[0].textContent).not.toContain("worktrees");
  });

  it("marks a hibernated workspace in its heading and leaves its rows undimmed", async () => {
    render(
      createElement(FolderPalette, {
        open: true,
        onOpenChange: vi.fn(),
        groups: [
          group({
            workspaceId: "ws-3",
            workspaceTitle: "Sleepy",
            hibernated: true,
            rows: [row({ workspaceId: "ws-3", path: "/sleepy", hibernated: true })],
          }),
        ],
        onPick: vi.fn(),
        onExpand: vi.fn(),
      }),
    );
    await settle();
    expect(document.querySelector('[aria-label="Workspace is hibernated"]')).not.toBeNull();
    expect(itemEls()[0].className).not.toContain("opacity-60");
  });

  it("shows the branch after the folder and only the label on the right", async () => {
    render(
      createElement(FolderPalette, {
        open: true,
        onOpenChange: vi.fn(),
        groups: [
          group({
            rows: [
              row({ path: "/repo", label: "Current tab", branch: "main", key: "ws-1:/repo" }),
              row({ path: "/home/a", display: "~", label: "Home", key: "ws-1:/home/a" }),
              row({ path: "/repo/src", key: "ws-1:/repo/src" }),
            ],
          }),
        ],
        onPick: vi.fn(),
        onExpand: vi.fn(),
      }),
    );
    await settle();
    const [current, home, plain] = itemEls();
    expect(current.textContent).toBe("/repo \u00b7 mainCurrent tab");
    expect(home.textContent).toBe("~Home");
    expect(home.querySelector("svg")).not.toBeNull();
    expect(plain.textContent).toBe("/repo/src");
  });

  describe("worktrees on Tab", () => {
    const hinted = [
      group({
        rows: [
          row({ path: "/repo", label: "Current tab", branch: "main", repoKey: "/repo", hiddenWorktrees: 2, key: "ws-1:/repo" }),
          row({ path: "/other", repoKey: null, key: "ws-1:/other" }),
          row({ path: "/repo/src", repoKey: "/repo", hiddenWorktrees: 2, key: "ws-1:/repo/src" }),
        ],
      }),
    ];
    const mountHinted = (onExpand: (row: FolderRow) => void) =>
      render(
        createElement(FolderPalette, {
          open: true,
          onOpenChange: vi.fn(),
          groups: hinted,
          onPick: vi.fn(),
          onExpand,
        }),
      );

    it("shows the hint instead of the label on every row of a repository with more worktrees", async () => {
      mountHinted(vi.fn());
      await settle();
      const [first, second, third] = itemEls();
      expect(first.textContent).toContain("TAB: show 2 worktrees");
      expect(first.textContent).not.toContain("Current tab");
      expect(second.textContent).not.toContain("TAB");
      expect(third.textContent).toContain("TAB: show 2 worktrees");
    });

    it("says worktree in the singular for one", async () => {
      render(
        createElement(FolderPalette, {
          open: true,
          onOpenChange: vi.fn(),
          groups: [group({ rows: [row({ repoKey: "/repo", hiddenWorktrees: 1 })] })],
          onPick: vi.fn(),
          onExpand: vi.fn(),
        }),
      );
      await settle();
      expect(itemEls()[0].textContent).toContain("TAB: show 1 worktree");
      expect(itemEls()[0].textContent).not.toContain("worktrees");
    });

    it("Tab on the selected row asks to expand its repository", async () => {
      const onExpand = vi.fn();
      mountHinted(onExpand);
      await settle();
      await act(async () => {
        fireEvent.keyDown(inputEl(), { key: "Tab" });
      });
      expect(onExpand).toHaveBeenCalledTimes(1);
      expect(onExpand.mock.calls[0][0]).toMatchObject({ path: "/repo", repoKey: "/repo" });
    });

    it("Tab on a row with nothing to add does nothing", async () => {
      const onExpand = vi.fn();
      mountHinted(onExpand);
      await settle();
      await act(async () => {
        fireEvent.keyDown(inputEl(), { key: "ArrowDown" });
      });
      await act(async () => {
        fireEvent.keyDown(inputEl(), { key: "Tab" });
      });
      expect(onExpand).not.toHaveBeenCalled();
    });
  });

  it("highlights the letters that match in the branch", async () => {
    render(
      createElement(FolderPalette, {
        open: true,
        onOpenChange: vi.fn(),
        groups: [group({ rows: [row({ path: "/repo/src", branch: "feat/login", key: "ws-1:/repo/src" })] })],
        onPick: vi.fn(),
        onExpand: vi.fn(),
      }),
    );
    await settle();
    await act(async () => {
      fireEvent.change(inputEl(), { target: { value: "login" } });
    });
    await settle();
    const bold = [...itemEls()[0].querySelectorAll("b")].map((b) => b.textContent);
    expect(bold).toEqual(["login"]);
  });
});

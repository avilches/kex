// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement, useState } from "react";
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
  repoName: over.repoName ?? null,
  pinned: over.pinned ?? false,
  cluster: over.cluster ?? 1,
  repoHint: over.repoHint ?? null,
  hint: over.hint ?? null,
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
        restoreFocus: vi.fn(),
      groups,
      onPick,
      onToggleWorktrees: vi.fn(),
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
        restoreFocus: vi.fn(),
        groups: [
          group({
            workspaceId: "ws-3",
            workspaceTitle: "Sleepy",
            hibernated: true,
            rows: [row({ workspaceId: "ws-3", path: "/sleepy", hibernated: true })],
          }),
        ],
        onPick: vi.fn(),
        onToggleWorktrees: vi.fn(),
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
        restoreFocus: vi.fn(),
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
        onToggleWorktrees: vi.fn(),
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
    const show = { kind: "show", count: 2 } as const;
    const base = (over: Partial<FolderRow>) =>
      row({ repoKey: "/repo", repoName: "repo", repoHint: show, ...over });
    // Two folders of one repository: the heading carries the hint, the rows keep their labels.
    const clustered = [
      group({
        rows: [
          base({ path: "/repo", label: "Workspace Root", cluster: 2, key: "ws-1:/repo" }),
          base({ path: "/repo/src", cluster: 2, key: "ws-1:/repo/src" }),
          row({ path: "/other", key: "ws-1:/other" }),
        ],
      }),
    ];
    const mountGroups = (groups: FolderGroup[], onToggleWorktrees: (row: FolderRow) => void) =>
      render(
        createElement(FolderPalette, {
          open: true,
          onOpenChange: vi.fn(),
        restoreFocus: vi.fn(),
          groups,
          onPick: vi.fn(),
          onToggleWorktrees,
        }),
      );

    it("puts the repository name and the hint on one small heading above its folders", async () => {
      mountGroups(clustered, vi.fn());
      await settle();
      const headings = [...document.querySelectorAll('[aria-hidden="true"]')].filter((el) =>
        el.textContent?.includes("show 2 worktrees"),
      );
      expect(headings).toHaveLength(1);
      expect(headings[0].textContent).toContain("repo");
      expect(headings[0].querySelector("kbd")?.textContent).toBe("Tab");
      const [first, second, third] = itemEls();
      expect(first.textContent).toContain("Workspace Root");
      expect(first.textContent).not.toContain("show");
      expect(second.textContent).not.toContain("show");
      expect(third.textContent).not.toContain("show");
    });

    it("draws the hint on the row itself, in place of its label, when there is no heading", async () => {
      mountGroups(
        [group({ rows: [base({ label: "Current tab", pinned: true, hint: show })] })],
        vi.fn(),
      );
      await settle();
      const [only] = itemEls();
      expect(only.textContent).toContain("show 2 worktrees");
      expect(only.textContent).not.toContain("Current tab");
      expect(only.querySelector("kbd")?.textContent).toBe("Tab");
    });

    it("says worktree in the singular for one, and hide once they are shown", async () => {
      mountGroups(
        [
          group({
            rows: [
              row({ path: "/a", key: "ws-1:/a", repoKey: "/a", hint: { kind: "show", count: 1 }, repoHint: { kind: "show", count: 1 } }),
              row({ path: "/b", key: "ws-1:/b", repoKey: "/b", hint: { kind: "hide" }, repoHint: { kind: "hide" } }),
            ],
          }),
        ],
        vi.fn(),
      );
      await settle();
      const [a, b] = itemEls();
      expect(a.textContent).toContain("show 1 worktree");
      expect(a.textContent).not.toContain("worktrees");
      expect(b.textContent).toContain("hide worktrees");
    });

    it("Tab on a row of the repository asks to toggle its worktrees, even without a hint of its own", async () => {
      const onToggle = vi.fn();
      mountGroups(clustered, onToggle);
      await settle();
      await act(async () => {
        fireEvent.keyDown(inputEl(), { key: "Tab" });
      });
      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle.mock.calls[0][0]).toMatchObject({ path: "/repo", repoKey: "/repo" });
    });

    it("Tab on a row outside any repository does nothing", async () => {
      const onToggle = vi.fn();
      mountGroups(clustered, onToggle);
      await settle();
      for (let i = 0; i < 2; i++) {
        await act(async () => {
          fireEvent.keyDown(inputEl(), { key: "ArrowDown" });
        });
        await settle();
      }
      await act(async () => {
        fireEvent.keyDown(inputEl(), { key: "Tab" });
      });
      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  it("highlights the letters that match in the branch", async () => {
    render(
      createElement(FolderPalette, {
        open: true,
        onOpenChange: vi.fn(),
        restoreFocus: vi.fn(),
        groups: [group({ rows: [row({ path: "/repo/src", branch: "feat/login", key: "ws-1:/repo/src" })] })],
        onPick: vi.fn(),
        onToggleWorktrees: vi.fn(),
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

  describe("focus on close", () => {
    function Stateful({ restore, onPick }: { restore: () => void; onPick: () => void }) {
      const [open, setOpen] = useState(true);
      return createElement(FolderPalette, {
        open,
        onOpenChange: setOpen,
        restoreFocus: restore,
        groups,
        onPick,
        onToggleWorktrees: vi.fn(),
      });
    }

    it("gives the focus back to the tab when Escape closes it", async () => {
      const restore = vi.fn();
      render(createElement(Stateful, { restore, onPick: vi.fn() }));
      await settle();
      await act(async () => {
        fireEvent.keyDown(document, { key: "Escape" });
      });
      await settle(80);
      expect(document.querySelector('[cmdk-input=""]')).toBeNull();
      expect(restore).toHaveBeenCalledTimes(1);
    });

    it("does not touch the focus when picking a folder closes it", async () => {
      const restore = vi.fn();
      const onPick = vi.fn();
      render(createElement(Stateful, { restore, onPick }));
      await settle();
      await act(async () => {
        fireEvent.keyDown(inputEl(), { key: "Enter" });
      });
      await settle(80);
      expect(onPick).toHaveBeenCalledTimes(1);
      expect(restore).not.toHaveBeenCalled();
    });
  });
});

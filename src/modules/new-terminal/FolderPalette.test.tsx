// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  headed: over.headed ?? (over.cluster ?? 1) >= 2,
  worktreeCount: over.worktreeCount ?? 0,
  worktreesLoading: over.worktreesLoading ?? false,
  nested: over.nested ?? false,
  repoHint: over.repoHint ?? null,
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

    const arrowDown = async () => {
      await act(async () => {
        fireEvent.keyDown(inputEl(), { key: "ArrowDown" });
      });
      await settle();
    };
    const repoHeadings = () =>
      [...document.querySelectorAll('[aria-hidden="true"]')].filter((el) =>
        el.querySelector("svg") && !el.closest("[cmdk-item]"),
      );

    it("shows how many worktrees the repository has on its heading, with no Tab hint, wherever the focus is", async () => {
      mountGroups(
        [
          group({
            rows: [
              row({ path: "/other", key: "ws-1:/other" }),
              base({ path: "/repo", label: "Workspace Root", cluster: 2, worktreeCount: 4, key: "ws-1:/repo" }),
              base({ path: "/repo/src", cluster: 2, worktreeCount: 4, key: "ws-1:/repo/src" }),
            ],
          }),
        ],
        vi.fn(),
      );
      await settle();
      const [heading] = repoHeadings();
      expect(heading.textContent).toContain("repo");
      expect(heading.textContent).toContain("4 worktrees");
      expect(heading.querySelector("kbd")).toBeNull();
      expect(heading.className).toContain("pl-3");
      await arrowDown();
      await waitFor(() => expect(itemEls()[1].textContent).toContain("show 2 worktrees"));
      expect(repoHeadings()[0].textContent).toContain("4 worktrees");
      expect(repoHeadings()[0].querySelector("kbd")).toBeNull();
    });

    it("shows a spinner on the heading while the worktree listing has not arrived", async () => {
      mountGroups(
        [
          group({
            rows: [
              base({ path: "/repo", label: "Workspace Root", cluster: 2, worktreesLoading: true, key: "ws-1:/repo" }),
              base({ path: "/repo/src", cluster: 2, worktreesLoading: true, key: "ws-1:/repo/src" }),
            ],
          }),
        ],
        vi.fn(),
      );
      await settle();
      const [heading] = repoHeadings();
      expect(heading.querySelector('[role="status"]')).not.toBeNull();
      expect(heading.textContent).not.toContain("worktree");
    });

    it("moves the hint onto the row that has the focus, and off the heading", async () => {
      mountGroups(
        [
          group({
            rows: [
              row({ path: "/other", key: "ws-1:/other" }),
              base({ path: "/repo", label: "Workspace Root", cluster: 2, key: "ws-1:/repo" }),
              base({ path: "/repo/src", cluster: 2, key: "ws-1:/repo/src" }),
            ],
          }),
        ],
        vi.fn(),
      );
      await settle();
      await arrowDown();
      await waitFor(() => expect(itemEls()[1].textContent).toContain("show 2 worktrees"));
      const [other, root, src] = itemEls();
      expect(root.textContent).not.toContain("Workspace Root");
      expect(root.querySelector("kbd")?.textContent).toBe("Tab");
      expect(other.textContent).not.toContain("show");
      expect(src.textContent).not.toContain("show");
      expect(repoHeadings()[0].querySelector("kbd")).toBeNull();
      await arrowDown();
      await waitFor(() => expect(itemEls()[2].textContent).toContain("show 2 worktrees"));
      expect(itemEls()[1].textContent).toContain("Workspace Root");
    });

    it("shows the hint on a lone row only while it has the focus", async () => {
      mountGroups(
        [
          group({
            rows: [
              row({ path: "/other", key: "ws-1:/other" }),
              base({ path: "/solo", label: "Current tab", pinned: true, key: "ws-1:/solo" }),
            ],
          }),
        ],
        vi.fn(),
      );
      await settle();
      expect(itemEls()[1].textContent).toContain("Current tab");
      expect(itemEls()[1].textContent).not.toContain("show");
      await arrowDown();
      await waitFor(() => expect(itemEls()[1].textContent).toContain("show 2 worktrees"));
      expect(itemEls()[1].textContent).not.toContain("Current tab");
    });

    it("says worktree in the singular for one, and hide once they are shown", async () => {
      mountGroups(
        [
          group({
            rows: [
              row({ path: "/a", key: "ws-1:/a", repoKey: "/a", repoHint: { kind: "show", count: 1 } }),
              row({ path: "/b", key: "ws-1:/b", repoKey: "/b", repoHint: { kind: "hide" } }),
            ],
          }),
        ],
        vi.fn(),
      );
      await settle();
      await waitFor(() => expect(itemEls()[0].textContent).toContain("show 1 worktree"));
      expect(itemEls()[0].textContent).not.toContain("worktrees");
      await arrowDown();
      await waitFor(() => expect(itemEls()[1].textContent).toContain("hide worktrees"));
    });

    it("opens a heading above the current tab when its repository has no other folder", async () => {
      mountGroups(
        [
          group({
            rows: [
              row({ path: "/repo/cur", label: "Current tab", repoKey: "/repo", repoName: "repo", headed: true, cluster: 1, repoHint: show, key: "ws-1:/repo/cur" }),
              row({ path: "/other", key: "ws-1:/other" }),
            ],
          }),
        ],
        vi.fn(),
      );
      await settle();
      const heading = [...document.querySelectorAll('[aria-hidden="true"]')].find((el) =>
        el.textContent?.includes("repo"),
      );
      expect(heading).toBeDefined();
      expect(heading?.nextElementSibling?.textContent).toContain("/repo/cur");
    });

    it("indents the worktrees added with Tab under the folders of their repository", async () => {
      mountGroups(
        [
          group({
            rows: [
              base({ path: "/repo/cur", label: "Current tab", cluster: 3, worktreeCount: 3, key: "ws-1:/repo/cur" }),
              base({ path: "/repo/a", cluster: 3, worktreeCount: 3, nested: true, key: "ws-1:/repo/a" }),
              base({ path: "/repo/b", cluster: 3, worktreeCount: 3, nested: true, key: "ws-1:/repo/b" }),
            ],
          }),
        ],
        vi.fn(),
      );
      await settle();
      const [cur, a, b] = itemEls();
      expect(cur.className).toContain("pl-7");
      expect(a.className).toContain("pl-12");
      expect(b.className).toContain("pl-12");
    });

    it("draws the Tab key with a background that shows on the row that has the focus", async () => {
      mountGroups(clustered, vi.fn());
      await settle();
      const kbd = itemEls()[0].querySelector("kbd");
      expect(kbd?.className).toContain("bg-foreground/10");
      expect(kbd?.className).not.toContain("bg-muted");
    });

    it("keeps the hint from making its row taller than the others, so the list does not shift", async () => {
      mountGroups(clustered, vi.fn());
      await settle();
      const chip = itemEls()[0].querySelector("kbd");
      expect(chip?.className).toContain("leading-none");
      expect(chip?.parentElement?.className).toContain("leading-none");
    });

    describe("headings in view", () => {
      const scrolled: Element[] = [];
      const original = Element.prototype.scrollIntoView;
      beforeEach(() => {
        scrolled.length = 0;
        Element.prototype.scrollIntoView = function (this: Element) {
          scrolled.push(this);
        };
      });
      afterEach(() => {
        Element.prototype.scrollIntoView = original;
      });

      const withRepoFirst = () => [
        group({
          rows: [
            base({ path: "/repo", label: "Workspace Root", cluster: 2, key: "ws-1:/repo" }),
            base({ path: "/repo/src", cluster: 2, key: "ws-1:/repo/src" }),
          ],
        }),
      ];

      it("brings the workspace heading into view when the first row is selected, even under a repository heading", async () => {
        mountGroups(withRepoFirst(), vi.fn());
        await settle();
        expect(scrolled.some((el) => el.hasAttribute("cmdk-group-heading"))).toBe(true);
        expect(scrolled.some((el) => el.hasAttribute("data-repo-heading"))).toBe(true);
      });

      it("leaves the workspace heading alone when a later row is selected", async () => {
        mountGroups(withRepoFirst(), vi.fn());
        await settle();
        scrolled.length = 0;
        await act(async () => {
          fireEvent.keyDown(inputEl(), { key: "ArrowDown" });
        });
        await settle();
        expect(scrolled.some((el) => el.hasAttribute("cmdk-group-heading"))).toBe(false);
        expect(scrolled.some((el) => el.hasAttribute("data-repo-heading"))).toBe(false);
      });
    });

    it("puts a terminal icon before every folder and a repository icon before the repository name", async () => {
      mountGroups(clustered, vi.fn());
      await settle();
      for (const el of itemEls()) {
        expect(el.querySelector("svg")).not.toBeNull();
      }
      const heading = [...document.querySelectorAll('[aria-hidden="true"]')].find((el) =>
        el.textContent?.includes("repo"),
      );
      expect(heading?.querySelector("svg")).not.toBeNull();
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

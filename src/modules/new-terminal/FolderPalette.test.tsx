// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runPaletteShortcut, runPaletteTabItem } from "@/modules/command-palette/lib/paletteControl";
import { PALETTE_TAB_SHORTCUTS } from "@/modules/command-palette/lib/paletteShortcuts";
import { FolderPalette } from "./FolderPalette";
import type { FolderGroup, FolderRow } from "./lib/folderEntries";

// `label` and `slot` are shorthands for a row that is only one thing; `labels` and `slots` say several.
type RowOver = Partial<FolderRow> & { label?: FolderRow["labels"][number]; slot?: FolderRow["slots"][number] };

const row = (over: RowOver = {}): FolderRow => ({
  key: over.key ?? `${over.workspaceId ?? "ws-1"}:${over.path ?? "/repo"}`,
  path: over.path ?? "/repo",
  display: over.display ?? over.path ?? "/repo",
  displayShift: over.displayShift ?? 0,
  labels: over.labels ?? (over.label ? [over.label] : []),
  branch: over.branch ?? null,
  repoKey: over.repoKey ?? null,
  repoName: over.repoName ?? null,
  pinned: over.pinned ?? false,
  slots: over.slots ?? (over.slot ? [over.slot] : []),
  cluster: over.cluster ?? 1,
  headed: over.headed ?? (over.cluster ?? 1) >= 2,
  worktreeCount: over.worktreeCount ?? 0,
  worktreesLoading: over.worktreesLoading ?? false,
  nested: over.nested ?? false,
  repoHint: over.repoHint ?? null,
  matchOffset: over.matchOffset ?? 0,
  workspaceId: over.workspaceId ?? "ws-1",
});

const group = (over: Partial<FolderGroup> = {}): FolderGroup => ({
  workspaceId: over.workspaceId ?? "ws-1",
  workspaceTitle: over.workspaceTitle ?? "Kex",
  workspaceColor: over.workspaceColor ?? null,
  workspaceIcon: over.workspaceIcon ?? null,
  active: over.active ?? false,
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
      workspaceOf: () => undefined,
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

  it("keeps a highlighted label in one piece next to its icon", async () => {
    render(
      createElement(FolderPalette, {
        open: true,
        onOpenChange: vi.fn(),
        restoreFocus: vi.fn(),
        groups: [
          group({
            rows: [row({ path: "/repo", label: "Workspace Root", slot: "root", pinned: true })],
          }),
        ],
        onPick: vi.fn(),
        onToggleWorktrees: vi.fn(),
        workspaceOf: () => undefined,
      }),
    );
    await settle();
    await act(async () => {
      fireEvent.change(inputEl(), { target: { value: "work" } });
    });
    await settle();
    const bold = itemEls()[0].querySelector("b");
    expect(bold).not.toBeNull();
    expect(bold?.parentElement?.querySelector("svg")).toBeNull();
    expect(bold?.parentElement?.textContent).toBe("Workspace Root");
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
        workspaceOf: () => undefined,
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
    const base = (over: RowOver) =>
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
    const mountGroups = (
      groups: FolderGroup[],
      onToggleWorktrees: (row: FolderRow) => void,
      onPick: (row: FolderRow) => void = vi.fn(),
    ) =>
      render(
        createElement(FolderPalette, {
          open: true,
          onOpenChange: vi.fn(),
        restoreFocus: vi.fn(),
          groups,
          onPick,
          onToggleWorktrees,
          workspaceOf: () => undefined,
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
      expect(root.querySelector("kbd")?.textContent).toMatch(/T$/);
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

    it("draws the repository heading once, above the folders that follow the fixed rows", async () => {
      const inRepo = { repoKey: "/repo", repoName: "repo", repoHint: show, cluster: 3 } as const;
      mountGroups(
        [
          group({
            active: true,
            rows: [
              row({ path: "/repo", label: "Current tab", headed: false, key: "ws-1:/repo", ...inRepo }),
              row({ path: "/docs", label: "Workspace Root", slot: "root", pinned: true, key: "ws-1:/docs" }),
              row({ path: "/Users/a", label: "Home", slot: "home", pinned: true, key: "ws-1:/Users/a" }),
              row({ path: "/repo/wt", headed: true, key: "ws-1:/repo/wt", ...inRepo }),
              row({ path: "/repo/scripts", headed: true, key: "ws-1:/repo/scripts", ...inRepo }),
            ],
          }),
        ],
        vi.fn(),
      );
      await settle();
      const headings = repoHeadings();
      expect(headings).toHaveLength(1);
      expect(headings[0].nextElementSibling?.textContent).toContain("/repo/wt");
      expect(itemEls()[0].previousElementSibling).not.toBe(headings[0]);
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

    it("draws the shortcut key with a background that shows on the row that has the focus", async () => {
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

    it("Cmd+T on a row of the repository asks to toggle its worktrees, even without a hint of its own", async () => {
      const onToggle = vi.fn();
      mountGroups(clustered, onToggle);
      await settle();
      let taken = false;
      await act(async () => {
        taken = runPaletteShortcut("newTab");
      });
      expect(taken).toBe(true);
      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle.mock.calls[0][0]).toMatchObject({ path: "/repo", repoKey: "/repo" });
    });

    it("Cmd+T on a row outside any repository does nothing", async () => {
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
        runPaletteShortcut("newTab");
      });
      expect(onToggle).not.toHaveBeenCalled();
    });

    it("Tab opens the menu of the row and no longer toggles the worktrees", async () => {
      const onToggle = vi.fn();
      mountGroups(clustered, onToggle);
      await settle();
      await act(async () => {
        fireEvent.keyDown(inputEl(), { key: "Tab" });
      });
      const items = [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent);
      expect(items[0]).toContain("New Tab in repo");
      expect(items[1]).toContain("worktrees");
      expect(items[2]).toContain("Copy Absolute Path");
      expect(onToggle).not.toHaveBeenCalled();
    });

    it("Enter on the menu picks the folder and Escape closes only the menu", async () => {
      const onPick = vi.fn();
      mountGroups(clustered, vi.fn(), onPick);
      await settle();
      await act(async () => {
        fireEvent.keyDown(inputEl(), { key: "Tab" });
      });
      await act(async () => {
        fireEvent.keyDown(inputEl(), { key: "Escape" });
      });
      expect(document.querySelector('[role="menu"]')).toBeNull();
      await act(async () => {
        fireEvent.keyDown(inputEl(), { key: "Tab" });
      });
      await act(async () => {
        fireEvent.keyDown(inputEl(), { key: "Enter" });
      });
      expect(onPick).toHaveBeenCalledTimes(1);
      expect(onPick.mock.calls[0][0]).toMatchObject({ path: "/repo" });
    });
  });

  describe("fixed rows and their shortcuts", () => {
    const fixed: FolderGroup[] = [
      group({
        workspaceId: "ws-1",
        active: true,
        rows: [
          row({ path: "/repo/wt", label: "Current tab", key: "ws-1:/repo/wt" }),
          row({
            path: "/repo",
            labels: ["Workspace Root", "Main checkout"],
            slots: ["root", "main"],
            pinned: true,
            key: "ws-1:/repo",
          }),
          row({ path: "/Users/a", label: "Home", slot: "home", pinned: true, key: "ws-1:/Users/a" }),
          row({ path: "/other", key: "ws-1:/other" }),
        ],
      }),
    ];
    const mountFixed = (rows: FolderGroup[], onPick = vi.fn()) =>
      render(
        createElement(FolderPalette, {
          open: true,
          onOpenChange: vi.fn(),
          restoreFocus: vi.fn(),
          groups: rows,
          onPick,
          onToggleWorktrees: vi.fn(),
          workspaceOf: () => undefined,
        }),
      );

    it.each([
      ["folderRoot", "root"],
      ["folderMain", "main"],
      ["folderHome", "home"],
    ] as const)("%s picks the %s row wherever the focus is", async (action, slot) => {
      const onPick = vi.fn();
      mountFixed(fixed, onPick);
      await settle();
      await act(async () => {
        fireEvent.keyDown(inputEl(), { key: "ArrowDown" });
      });
      let taken = false;
      await act(async () => {
        taken = runPaletteShortcut(action);
      });
      expect(taken).toBe(true);
      expect(onPick).toHaveBeenCalledTimes(1);
      expect(onPick.mock.calls[0][0].slots).toContain(slot);
    });

    it("takes the key and does nothing when that fixed row does not exist", async () => {
      const onPick = vi.fn();
      mountFixed(
        [group({ rows: [row({ path: "/a", label: "Current tab" }), row({ path: "/h", label: "Home", slot: "home", pinned: true, key: "ws-1:/h" })] })],
        onPick,
      );
      await settle();
      let taken = false;
      await act(async () => {
        taken = runPaletteShortcut("folderMain");
      });
      expect(taken).toBe(true);
      expect(onPick).not.toHaveBeenCalled();
    });

    it("draws the key of each fixed row on the row", async () => {
      mountFixed(fixed);
      await settle();
      const keys = (label: string) =>
        itemEls().find((el) => el.textContent?.includes(label))?.querySelector("kbd")?.textContent;
      expect(keys("Workspace Root")).toMatch(/1$/);
      expect(keys("Home")).toMatch(/3$/);
      expect(keys("Current tab")).toBeUndefined();
    });

    it("lists the keys of the three fixed rows in the footer, whichever row has the focus", async () => {
      mountFixed(fixed);
      await settle();
      const footerKeys = () =>
        [...(document.querySelector("[cmdk-root] > div:last-child")?.querySelectorAll("kbd") ?? [])].map(
          (el) => el.textContent,
        );
      const before = footerKeys();
      expect(before.some((k) => k?.endsWith("1"))).toBe(true);
      expect(before.some((k) => k?.endsWith("2"))).toBe(true);
      expect(before.some((k) => k?.endsWith("3"))).toBe(true);
      for (let i = 0; i < 2; i++) {
        await act(async () => {
          fireEvent.keyDown(inputEl(), { key: "ArrowDown" });
        });
        await settle();
        expect(footerKeys().filter((k) => /[123]$/.test(k ?? ""))).toHaveLength(3);
      }
    });

    it("puts the worktrees key before the fixed keys in the footer, so they never shift", async () => {
      mountFixed([
        group({
          active: true,
          rows: [
            row({ path: "/repo", label: "Current tab", key: "ws-1:/repo", repoKey: "/repo", repoHint: { kind: "show", count: 1 } }),
            row({ path: "/h", label: "Home", slot: "home", pinned: true, key: "ws-1:/h" }),
          ],
        }),
      ]);
      await settle();
      const keys = [...(document.querySelector("[cmdk-root] > div:last-child")?.querySelectorAll("kbd") ?? [])].map(
        (el) => el.textContent ?? "",
      );
      const worktrees = keys.findIndex((k) => /T$/i.test(k));
      const home = keys.findIndex((k) => k.endsWith("3"));
      expect(worktrees).toBeGreaterThan(-1);
      expect(worktrees).toBeLessThan(home);
    });

    it("keeps the fixed key beside the worktrees hint on the focused fixed row", async () => {
      mountFixed([
        group({
          active: true,
          rows: [
            row({ path: "/h", label: "Home", slot: "home", pinned: true, key: "ws-1:/h", repoKey: "/r", repoHint: { kind: "show", count: 1 } }),
          ],
        }),
      ]);
      await settle();
      const kbds = [...(itemEls()[0]?.querySelectorAll("kbd") ?? [])].map((el) => el.textContent ?? "");
      expect(kbds).toHaveLength(2);
      expect(kbds.some((k) => k.endsWith("3"))).toBe(true);
    });

    it("draws a pin before the workspace root and a house before home", async () => {
      mountFixed(fixed);
      await settle();
      const labelIcons = (key: string) =>
        document.querySelector(`[data-folder-row="${key}"]`)?.querySelectorAll("span.ml-auto svg").length;
      expect(labelIcons("ws-1:/repo")).toBe(1);
      expect(labelIcons("ws-1:/Users/a")).toBe(1);
      expect(labelIcons("ws-1:/other")).toBe(0);
    });

    it("gives a folder that is several things one row with every label and its own key beside each", async () => {
      mountFixed(fixed);
      await settle();
      const merged = document.querySelector('[data-folder-row="ws-1:/repo"]');
      expect(merged?.textContent).toContain("Workspace Root");
      expect(merged?.textContent).toContain("Main checkout");
      const keys = [...(merged?.querySelectorAll("kbd") ?? [])].map((el) => el.textContent ?? "");
      expect(keys).toHaveLength(2);
      expect(keys[0]).toMatch(/1$/);
      expect(keys[1]).toMatch(/2$/);
      expect(document.querySelectorAll('[data-folder-row="ws-1:/repo"]')).toHaveLength(1);
    });

    it("both keys of a merged row pick that one row", async () => {
      const onPick = vi.fn();
      mountFixed(fixed, onPick);
      await settle();
      for (const action of ["folderRoot", "folderMain"] as const) {
        await act(async () => {
          runPaletteShortcut(action);
        });
      }
      expect(onPick).toHaveBeenCalledTimes(2);
      expect(onPick.mock.calls.map((c) => c[0].path)).toEqual(["/repo", "/repo"]);
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
        workspaceOf: () => undefined,
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
        workspaceOf: () => undefined,
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

  describe("close shortcuts", () => {
    it("Close Workspace is taken without effect, so the workspace behind the palette is not closed", async () => {
      const onPick = vi.fn();
      mount(onPick);
      await settle();
      let taken = false;
      await act(async () => {
        taken = runPaletteShortcut("closeWorkspace");
      });
      expect(taken).toBe(true);
      expect(onPick).not.toHaveBeenCalled();
    });

    it.each(Object.values(PALETTE_TAB_SHORTCUTS).filter((item) => item !== "copy"))(
      "the %s tab shortcut is taken without effect, so the tab behind the palette is not touched",
      async (item) => {
        const onPick = vi.fn();
        mount(onPick);
        await settle();
        let taken = false;
        await act(async () => {
          taken = runPaletteTabItem(item);
        });
        expect(taken).toBe(true);
        expect(onPick).not.toHaveBeenCalled();
      },
    );
  });
});

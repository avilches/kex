import { describe, expect, it } from "vitest";
import { PALETTE_TAB_SHORTCUTS } from "@/modules/command-palette/lib/paletteShortcuts";
import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import {
  historyPaletteShortcutUnavailable,
  paletteShortcutUnavailable,
  shortcutUnavailable,
  shortcutUnavailableBehindPalette,
} from "./shortcutContext";
import type { Tab } from "./types";

const terminal: Tab = { id: "t", kind: "terminal" };
const editor: Tab = { id: "e", kind: "editor", path: "/p/a.ts", dirty: false, preview: false };
const markdown: Tab = { id: "m", kind: "markdown", path: "/p/a.md" };

const sleeping: Tab = { id: "s", kind: "terminal", hibernation: { at: 1 } };
const base = { activeTab: terminal, hasWorkspaceRoot: true, scriptCount: 1 };

describe("shortcutUnavailable", () => {
  it("blocks only what acts on a live terminal while the focused tab sleeps", () => {
    const asleep = { ...base, activeTab: sleeping };
    for (const id of ["terminal.clear", "terminal.scratchpad", "search.focus"] as const) {
      expect(shortcutUnavailable(id, asleep), id).toBe(true);
      expect(shortcutUnavailable(id, base), id).toBe(false);
    }
  });

  it("leaves tab, pane, sidebar, explorer and hibernate usable on a sleeping tab", () => {
    const asleep = { ...base, activeTab: sleeping };
    for (const id of ["tab.hibernate", "tab.rename", "tab.close", "tab.next", "pane.splitRight", "sidebar.toggle", "explorer.search"] as const) {
      expect(shortcutUnavailable(id, asleep), id).toBe(false);
    }
  });

  it("needs an editor tab for undo, redo and the editor-only actions", () => {
    expect(shortcutUnavailable("editor.undo", base)).toBe(true);
    expect(shortcutUnavailable("editor.undo", { ...base, activeTab: editor })).toBe(false);
  });

  it("allows save on editor and markdown tabs only", () => {
    expect(shortcutUnavailable("editor.save", base)).toBe(true);
    expect(shortcutUnavailable("editor.save", { ...base, activeTab: editor })).toBe(false);
    expect(shortcutUnavailable("editor.save", { ...base, activeTab: markdown })).toBe(false);
  });

  it("needs a markdown tab for the outline", () => {
    expect(shortcutUnavailable("markdown.toggleOutline", { ...base, activeTab: editor })).toBe(true);
    expect(shortcutUnavailable("markdown.toggleOutline", { ...base, activeTab: markdown })).toBe(false);
  });

  it("handles no active tab", () => {
    expect(shortcutUnavailable("editor.save", { ...base, activeTab: null })).toBe(true);
  });

  it("does not look at the workspace root or the scripts", () => {
    expect(shortcutUnavailable("sidebar.showNotes", { ...base, hasWorkspaceRoot: false })).toBe(false);
  });
});

describe("paletteShortcutUnavailable", () => {
  it("adds the two handlers that return silently without their prerequisite", () => {
    expect(paletteShortcutUnavailable("sidebar.showNotes", { ...base, hasWorkspaceRoot: false })).toBe(true);
    expect(paletteShortcutUnavailable("sidebar.showNotes", base)).toBe(false);
  });

  it("keeps every rule of shortcutUnavailable", () => {
    expect(paletteShortcutUnavailable("editor.save", base)).toBe(true);
  });
});

describe("historyPaletteShortcutUnavailable", () => {
  it("needs a terminal tab", () => {
    expect(historyPaletteShortcutUnavailable({ activeTab: null, promptReady: true, runningCommand: null })).toBe(true);
    expect(historyPaletteShortcutUnavailable({ activeTab: editor, promptReady: true, runningCommand: null })).toBe(true);
    expect(historyPaletteShortcutUnavailable({ activeTab: terminal, promptReady: true, runningCommand: null })).toBe(false);
  });

  it("needs the shell ready to receive a command", () => {
    expect(historyPaletteShortcutUnavailable({ activeTab: terminal, promptReady: false, runningCommand: null })).toBe(true);
  });

  it("stays out while a command runs", () => {
    expect(historyPaletteShortcutUnavailable({ activeTab: terminal, promptReady: true, runningCommand: "pnpm dev" })).toBe(true);
  });

  it("stays out while any foreground process owns the terminal, even with no running command reported", () => {
    expect(historyPaletteShortcutUnavailable({ activeTab: terminal, promptReady: true, runningCommand: null, foregroundProcess: "bun" })).toBe(true);
    expect(historyPaletteShortcutUnavailable({ activeTab: terminal, promptReady: true, runningCommand: null, foregroundProcess: null })).toBe(false);
  });
});

describe("shortcutUnavailableBehindPalette", () => {
  const ids = Object.keys(PALETTE_TAB_SHORTCUTS) as ShortcutId[];

  it("lets the seven tab shortcuts through with a palette open, whatever the tab behind is", () => {
    expect(ids).toHaveLength(7);
    for (const id of ids) {
      expect(shortcutUnavailableBehindPalette(id, base, { open: true, ownsTabShortcut: true })).toBe(false);
    }
  });

  it("would block Save for a terminal behind the palette if it did not own it", () => {
    expect(shortcutUnavailable("editor.save", base)).toBe(true);
    expect(shortcutUnavailableBehindPalette("editor.save", base, { open: false, ownsTabShortcut: true })).toBe(true);
  });

  it("keeps blocking the shortcuts the palette does not own", () => {
    expect(shortcutUnavailableBehindPalette("editor.undo", base, { open: true, ownsTabShortcut: false })).toBe(true);
  });
});

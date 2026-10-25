import { describe, expect, it } from "vitest";
import { historyPaletteShortcutUnavailable, paletteShortcutUnavailable, shortcutUnavailable } from "./shortcutContext";
import type { Tab } from "./types";

const terminal: Tab = { id: "t", kind: "terminal" };
const editor: Tab = { id: "e", kind: "editor", path: "/p/a.ts", dirty: false, preview: false };
const markdown: Tab = { id: "m", kind: "markdown", path: "/p/a.md" };

const base = { hibernated: false, activeTab: terminal, hasWorkspaceRoot: true, scriptCount: 1 };

describe("shortcutUnavailable", () => {
  it("blocks the shortcuts a hibernated workspace refuses", () => {
    expect(shortcutUnavailable("tab.rename", { ...base, hibernated: true })).toBe(true);
    expect(shortcutUnavailable("tab.rename", base)).toBe(false);
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
    expect(shortcutUnavailable("workspace.run", { ...base, scriptCount: 0 })).toBe(false);
  });
});

describe("paletteShortcutUnavailable", () => {
  it("adds the two handlers that return silently without their prerequisite", () => {
    expect(paletteShortcutUnavailable("sidebar.showNotes", { ...base, hasWorkspaceRoot: false })).toBe(true);
    expect(paletteShortcutUnavailable("sidebar.showNotes", base)).toBe(false);
    expect(paletteShortcutUnavailable("workspace.run", { ...base, scriptCount: 0 })).toBe(true);
    expect(paletteShortcutUnavailable("workspace.run", base)).toBe(false);
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

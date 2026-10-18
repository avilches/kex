import { describe, expect, it } from "vitest";
import { tabTitle } from "./tabTitle";
import { expandTabTitle, expandWorkspaceTitle, tabRawValues, tabTitleVars } from "./titleVars";
import type { Tab } from "./types";

const terminal = (o: Partial<{ cwd: string; title: string }> = {}): Tab => ({
  id: "t1",
  kind: "terminal",
  ...o,
});
const editor = (path: string, title?: string): Tab => ({
  id: "e1",
  kind: "editor",
  path,
  dirty: false,
  preview: false,
  title,
});
const git = { branch: "feat/x", repoRoot: "/Users/me/code/kex" };

describe("tabTitleVars", () => {
  it("derives location variables from a terminal cwd and abbreviates home", () => {
    const v = tabTitleVars(terminal({ cwd: "/Users/me/code/kex/src" }), { home: "/Users/me", git });
    expect(v).toMatchObject({
      cwd: "~/code/kex/src",
      dir: "src",
      branch: "feat/x",
      repo: "kex",
      file: "",
    });
  });

  it("derives dir and file from an editor path", () => {
    const v = tabTitleVars(editor("/p/q/a.ts"));
    expect(v).toMatchObject({ cwd: "/p/q", dir: "q", file: "a.ts" });
  });

  it("collapses the running command and uses empty strings for what is missing", () => {
    const v = tabTitleVars(terminal(), { runningCommand: "  npm   run dev " });
    expect(v).toMatchObject({ cmd: "npm run dev", cwd: "", branch: "", agent: "", host: "" });
  });

  it("exposes the model, trimmed, and leaves it empty without one", () => {
    expect(tabTitleVars(terminal(), { model: " claude-sonnet-4-6 " }).model).toBe("claude-sonnet-4-6");
    expect(tabTitleVars(terminal()).model).toBe("");
  });

  it("falls back to fallbackDir when the tab has no location", () => {
    const browser: Tab = { id: "b", kind: "browser", url: "http://x" };
    expect(tabTitleVars(browser, { fallbackDir: "/w/root" })).toMatchObject({ dir: "root" });
  });
});

describe("tab titles with templates", () => {
  it("expands the user title and keeps plain titles as they were", () => {
    expect(expandTabTitle(terminal({ cwd: "/a/b", title: "{dir}!" }))).toBe("b!");
    expect(expandTabTitle(terminal({ cwd: "/a/b", title: "plain" }))).toBe("plain");
    expect(expandTabTitle(terminal({ cwd: "/a/b" }))).toBe("");
  });

  it("tabTitle shows the expansion for a terminal and for other kinds", () => {
    expect(tabTitle(terminal({ cwd: "/a/b", title: "{dir} {cmd}" }), "ls -la")).toBe("b ls -la");
    expect(tabTitle(editor("/p/a.ts", "edit {file}"))).toBe("edit a.ts");
  });

  it("tabTitle falls back to the default when the template expands to nothing", () => {
    expect(tabTitle(terminal({ cwd: "/a/b", title: "{branch}" }))).toBe("b");
  });

  it("{tab} is not a tab variable and stays literal", () => {
    expect(tabTitle(terminal({ cwd: "/a/b", title: "{tab}" }))).toBe("{tab}");
  });
});

describe("workspace titles", () => {
  const ws = { title: "{repo} - {tab}", cwd: "/w", workspaceRoot: "/w/root" };

  it("takes its location from the focused tab", () => {
    const out = expandWorkspaceTitle(
      { title: "{dir}", cwd: "/w" },
      terminal({ cwd: "/a/b" }),
      "shell",
    );
    expect(out).toBe("b");
  });

  it("falls back to the workspace root when the focused tab has no location", () => {
    const browser: Tab = { id: "b", kind: "browser", url: "http://x" };
    expect(expandWorkspaceTitle({ title: "{dir}", cwd: undefined, workspaceRoot: "/w/root" }, browser, "")).toBe("root");
  });

  it("exposes the focused tab title as {tab}", () => {
    expect(expandWorkspaceTitle(ws, terminal({ cwd: "/a/b" }), "vim", { git })).toBe("kex - vim");
  });
});

describe("{workspace}", () => {
  it("is the workspace root with home as ~, empty without one", () => {
    const v = tabTitleVars(terminal(), { workspaceRoot: "/Users/me/code/kex", home: "/Users/me" });
    expect(v.workspace).toBe("~/code/kex");
    expect(tabTitleVars(terminal()).workspace).toBe("");
  });

  it("names the workspace root in a workspace title whatever the focused tab", () => {
    const browser: Tab = { id: "b", kind: "browser", url: "http://x" };
    expect(expandWorkspaceTitle({ title: "{workspace}", workspaceRoot: "/w/root" }, browser, "")).toBe("/w/root");
  });
});

describe("{path}", () => {
  it("is the full file path with home as ~, empty for a tab without a file", () => {
    expect(tabTitleVars(editor("/Users/me/code/a.ts"), { home: "/Users/me" })).toMatchObject({
      path: "~/code/a.ts",
      file: "a.ts",
    });
    expect(tabTitleVars(terminal({ cwd: "/a" })).path).toBe("");
  });

  it("expands in a title and leaves {file} as the name", () => {
    expect(expandTabTitle(editor("/p/q/a.ts", "{path} | {file}"))).toBe("/p/q/a.ts | a.ts");
  });
});

describe("tabRawValues", () => {
  it("keeps paths untouched: no ~ and no collapsed spaces", () => {
    const raw = tabRawValues(editor("/Users/me/my  code/a.ts"), {
      home: "/Users/me",
      workspaceRoot: "/Users/me/ws",
    });
    expect(raw).toEqual({
      cwd: "/Users/me/my  code",
      dir: "my  code",
      file: "a.ts",
      path: "/Users/me/my  code/a.ts",
      workspace: "/Users/me/ws",
    });
  });

  it("uses empty strings for what is missing and honors fallbackDir", () => {
    const browser: Tab = { id: "b", kind: "browser", url: "http://x" };
    expect(tabRawValues(browser, { fallbackDir: "/w/root" })).toEqual({
      cwd: "/w/root",
      dir: "root",
      file: "",
      path: "",
      workspace: "",
    });
  });
});

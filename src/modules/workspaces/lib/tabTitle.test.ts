import { describe, expect, it } from "vitest";
import { FACTORY_TITLE_DEFAULTS, resolveTitleDefaults } from "./defaultTitles";
import { tabTitle } from "./tabTitle";
import type { Tab } from "./types";

const terminal = (overrides: Partial<{ cwd: string; title: string }> = {}): Tab => ({
  id: "p1",
  kind: "terminal",
  ...overrides,
});

describe("tabTitle - terminal factory default: what is running, then the folder and branch", () => {
  const t = terminal({ cwd: "/home/me/kex" });
  const inRepo = { git: { branch: "main", repoRoot: "/home/me/kex" } };

  it("an idle shell shows the folder, plus the branch inside a repository", () => {
    expect(tabTitle(t, null, undefined, inRepo)).toBe("kex · main");
    expect(tabTitle(t, null, undefined)).toBe("kex");
  });

  it("a running command is followed by the folder, plus the branch inside a repository", () => {
    expect(tabTitle(t, "cargo build", undefined, inRepo)).toBe("cargo build · kex · main");
    expect(tabTitle(t, "cargo build", undefined)).toBe("cargo build · kex");
  });

  it("shows the whole running command with whitespace collapsed", () => {
    expect(tabTitle(t, "  npm run\n  dev ", undefined)).toBe("npm run dev · kex");
  });

  it("the title the program sets is used when no command is running", () => {
    expect(tabTitle(t, null, "vim notes.md", inRepo)).toBe("vim notes.md · kex · main");
    expect(tabTitle(t, null, "", inRepo)).toBe("kex · main");
  });

  it("runningCommand overrides oscTitle", () => {
    expect(tabTitle(t, "cargo build", "vim")).toBe("cargo build · kex");
  });

  it("tab.title overrides everything", () => {
    expect(tabTitle(terminal({ cwd: "/home/me", title: "custom" }), "ls", "vim")).toBe("custom");
  });

  it("a terminal at the root of the disk still has a folder to show", () => {
    const root = terminal({ cwd: "/" });
    expect(tabTitle(root, null, undefined)).toBe("/");
    expect(tabTitle(root, "ls", undefined)).toBe("ls · /");
  });

  it("falls back to shell when there is nothing at all", () => {
    expect(tabTitle(terminal(), null, undefined)).toBe("shell");
  });

  it("a custom default can still show the whole path with the home as ~", () => {
    const defaults = resolveTitleDefaults({ terminal: "{cwd}" });
    expect(tabTitle(terminal({ cwd: "/home/me/code" }), null, undefined, { home: "/home/me", defaults })).toBe("~/code");
  });
});

describe("tabTitle - other kinds", () => {
  const editor: Tab = { id: "p2", kind: "editor", path: "/src/foo.ts", dirty: false, preview: false };

  it("editor title is the file name and ignores oscTitle", () => {
    expect(tabTitle(editor, null, "some osc title")).toBe("foo.ts");
  });

  it("browser shows the url, or Browser without one", () => {
    expect(tabTitle({ id: "b", kind: "browser", url: "http://x.dev" })).toBe("http://x.dev");
    expect(tabTitle({ id: "b", kind: "browser", url: "" })).toBe("Browser");
  });

  it("git history names the repository folder it shows", () => {
    expect(tabTitle({ id: "h", kind: "git-history", repoRoot: "/code/kex" } as Tab)).toBe("Git History · kex");
  });

  it("git history falls back to a fixed name when the template expands to nothing", () => {
    const defaults = resolveTitleDefaults({ gitHistory: "{branch}" });
    expect(tabTitle({ id: "h", kind: "git-history", repoRoot: "/code/kex" } as Tab, null, undefined, { defaults })).toBe(
      "Git History",
    );
  });

  it("falls back to the file name when a custom editor default expands to nothing", () => {
    const defaults = resolveTitleDefaults({ editor: "{branch}" });
    expect(tabTitle(editor, null, undefined, { defaults })).toBe("foo.ts");
  });

  it("editors and diffs have their own default", () => {
    const defaults = resolveTitleDefaults({ editor: "{file}{?dir · {dir}}", diff: "diff {file}" });
    const diff: Tab = { id: "d", kind: "git-diff", path: "a/b.ts", repoRoot: "/r" } as Tab;
    expect(tabTitle(editor, null, undefined, { defaults })).toBe("foo.ts · src");
    expect(tabTitle(diff, null, undefined, { defaults })).toBe("diff b.ts");
    const markdown: Tab = { id: "m", kind: "markdown", path: "/docs/readme.md" } as Tab;
    expect(tabTitle(markdown, null, undefined, { defaults })).toBe("readme.md · docs");
  });
});

describe("tabTitle - agent terminals", () => {
  const agent = { agent: "claude" };
  const t = terminal({ cwd: "/home/me" });

  const inRepo = { git: { branch: "main", repoRoot: "/home/me" } };

  it("oscTitle wins over the session title, followed by the folder", () => {
    expect(tabTitle(t, null, "live status", { ...agent, session: "initial" })).toBe("live status · me");
  });

  it("the session title wins when oscTitle is absent", () => {
    expect(tabTitle(t, null, undefined, { ...agent, session: "initial" })).toBe("initial · me");
  });

  it("falls back to agent and folder when neither title is present", () => {
    expect(tabTitle(t, null, undefined, agent)).toBe("claude · me");
  });

  it("adds the branch to the folder inside a repository", () => {
    expect(tabTitle(t, null, "live status", { ...agent, ...inRepo })).toBe("live status · me · main");
    expect(tabTitle(t, null, undefined, { ...agent, ...inRepo })).toBe("claude · me · main");
  });

  it("shows the folder at the root of the disk too", () => {
    expect(tabTitle(terminal({ cwd: "/" }), null, "live status", agent)).toBe("live status · /");
  });

  it("ignores the running command, which is literally the agent binary", () => {
    expect(tabTitle(t, "claude --resume", undefined, agent)).toBe("claude · me");
  });

  it("a manual rename still wins", () => {
    const named = terminal({ cwd: "/home/me", title: "renamed" });
    expect(tabTitle(named, null, "live status", { ...agent, session: "s" })).toBe("renamed");
  });
});

describe("tabTitle - configurable defaults", () => {
  it("uses the terminal default the user chose", () => {
    const defaults = resolveTitleDefaults({ terminal: "{dir}{?branch · {branch}}" });
    const git = { branch: "main", repoRoot: "/home/me/kex" };
    const t = terminal({ cwd: "/home/me/kex" });
    expect(tabTitle(t, "ls", undefined, { defaults, git })).toBe("kex · main");
    expect(tabTitle(t, "ls", undefined, { defaults })).toBe("kex");
  });

  it("uses the agent default only for agent terminals", () => {
    const defaults = resolveTitleDefaults({ agent: "[{agent}] {dir}" });
    const t = terminal({ cwd: "/home/me" });
    expect(tabTitle(t, null, "osc", { defaults, agent: "claude" })).toBe("[claude] me");
    expect(tabTitle(t, null, "osc", { defaults })).toBe("osc · me");
  });

  it("an empty pref keeps the factory default", () => {
    expect(resolveTitleDefaults({ terminal: "  ", editor: "" })).toEqual(FACTORY_TITLE_DEFAULTS);
  });
});

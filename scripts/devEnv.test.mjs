import { describe, expect, it } from "vitest";
import { stripClaudeSessionEnv } from "./devEnv.mjs";

describe("stripClaudeSessionEnv", () => {
  it("drops every CLAUDE* variable inside a Claude Code session and keeps the rest", () => {
    const env = {
      CLAUDECODE: "1",
      CLAUDE_CODE_CHILD_SESSION: "1",
      CLAUDE_CODE_SESSION_ID: "abc",
      CLAUDE_PID: "42",
      PATH: "/usr/bin",
      KEX_DEV_PORT: "1451",
      ANTHROPIC_MODEL: "x",
    };
    expect(stripClaudeSessionEnv(env)).toEqual({ PATH: "/usr/bin", KEX_DEV_PORT: "1451", ANTHROPIC_MODEL: "x" });
  });

  it("leaves the environment untouched outside a Claude Code session", () => {
    const env = { PATH: "/usr/bin", CLAUDE_CONFIG_DIR: "/home/u/.claude" };
    expect(stripClaudeSessionEnv(env)).toBe(env);
  });

  it("does not mutate the environment it receives", () => {
    const env = { CLAUDECODE: "1", PATH: "/usr/bin" };
    stripClaudeSessionEnv(env);
    expect(env).toEqual({ CLAUDECODE: "1", PATH: "/usr/bin" });
  });
});

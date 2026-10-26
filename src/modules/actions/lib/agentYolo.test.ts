import { describe, expect, it } from "vitest";
import { agentBinary, isYolo, setYolo, yoloCommand, yoloSwitch } from "./agentYolo";

describe("yoloCommand", () => {
  it("starts every known agent without permission prompts", () => {
    expect(
      ["claude", "codex", "agy", "openclaude", "grok", "aider", "goose", "cursor-agent"].map(yoloCommand),
    ).toEqual([
      "claude --dangerously-skip-permissions",
      "codex --dangerously-bypass-approvals-and-sandbox",
      "agy --dangerously-skip-permissions",
      "openclaude --dangerously-skip-permissions",
      "grok --permission-mode bypassPermissions",
      "aider --yes-always",
      "GOOSE_MODE=auto goose",
      "cursor-agent --yolo",
    ]);
  });

  it("leaves an agent without a bypass switch as the bare binary", () => {
    expect(["opencode", "omp", "pi"].map(yoloCommand)).toEqual(["opencode", "omp", "pi"]);
  });
});

describe("agentBinary", () => {
  it("skips assignments, directories and Windows extensions", () => {
    expect(agentBinary("claude --x")).toBe("claude");
    expect(agentBinary("A=1 B=2 goose")).toBe("goose");
    expect(agentBinary("/opt/bin/claude")).toBe("claude");
    expect(agentBinary("C:\\bin\\claude.exe --x")).toBe("claude");
    expect(agentBinary("  ")).toBeNull();
  });
});

describe("yoloSwitch", () => {
  it("is null for an unknown binary", () => {
    expect(yoloSwitch("pnpm dev")).toBeNull();
    expect(yoloSwitch("opencode")).toBeNull();
    expect(yoloSwitch("")).toBeNull();
  });
  it("names the switch of a known agent", () => {
    expect(yoloSwitch("claude -c")).toBe("--dangerously-skip-permissions");
    expect(yoloSwitch("goose")).toBe("GOOSE_MODE=auto");
  });
});

describe("isYolo", () => {
  it("finds the switch wherever it is", () => {
    expect(isYolo("claude --dangerously-skip-permissions")).toBe(true);
    expect(isYolo("claude --dangerously-skip-permissions -c")).toBe(true);
    expect(isYolo("claude -c --dangerously-skip-permissions --model x")).toBe(true);
    expect(isYolo("grok --permission-mode   bypassPermissions")).toBe(true);
    expect(isYolo("A=1 GOOSE_MODE=auto goose")).toBe(true);
  });
  it("needs the whole token", () => {
    expect(isYolo("claude --dangerously-skip-permissions-x")).toBe(false);
    expect(isYolo("claude")).toBe(false);
    expect(isYolo("grok --permission-mode plan")).toBe(false);
    expect(isYolo("GOOSE_MODE=smart goose")).toBe(false);
  });
});

describe("setYolo", () => {
  it("adds the switch at the end", () => {
    expect(setYolo("claude -c", true)).toBe("claude -c --dangerously-skip-permissions");
    expect(setYolo("grok", true)).toBe("grok --permission-mode bypassPermissions");
  });
  it("puts the goose assignment after the others and before the binary", () => {
    expect(setYolo("goose session", true)).toBe("GOOSE_MODE=auto goose session");
    expect(setYolo("A=1 goose", true)).toBe("A=1 GOOSE_MODE=auto goose");
  });
  it("does not add it twice", () => {
    expect(setYolo("claude --dangerously-skip-permissions -c", true)).toBe("claude --dangerously-skip-permissions -c");
  });
  it("removes it wherever it is, keeping the rest", () => {
    expect(setYolo("claude --dangerously-skip-permissions", false)).toBe("claude");
    expect(setYolo("claude --dangerously-skip-permissions -c", false)).toBe("claude -c");
    expect(setYolo("claude -c --dangerously-skip-permissions --model x", false)).toBe("claude -c --model x");
    expect(setYolo("grok --permission-mode bypassPermissions -p", false)).toBe("grok -p");
    expect(setYolo("A=1 GOOSE_MODE=auto goose", false)).toBe("A=1 goose");
  });
  it("round-trips", () => {
    expect(setYolo(setYolo("claude -c", true), false)).toBe("claude -c");
  });
  it("leaves a command that is not a known agent as it is", () => {
    expect(setYolo("pnpm dev", true)).toBe("pnpm dev");
    expect(setYolo("opencode", true)).toBe("opencode");
  });
});

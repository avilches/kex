import { describe, expect, it } from "vitest";
import { processLabel } from "./terminalProcess";

type Info = Parameters<typeof processLabel>[0];

const info = (over: Partial<Info> = {}): Info => ({
  runningCommand: null,
  fgName: null,
  shellName: "zsh",
  ...over,
});

describe("processLabel", () => {
  it("prefers the running command and collapses its whitespace", () => {
    expect(processLabel(info({ runningCommand: "  npm   run dev " }))).toBe("npm run dev");
  });

  it("falls back to the foreground child, then the shell", () => {
    expect(processLabel(info({ fgName: "vite" }))).toBe("vite");
    expect(processLabel(info())).toBe("zsh");
  });

  it("returns an empty label when the shell name is unknown and nothing runs", () => {
    expect(processLabel(info({ shellName: "" }))).toBe("");
  });
});

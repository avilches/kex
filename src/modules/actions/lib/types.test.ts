import { describe, expect, it } from "vitest";
import { isAgent, isApp, isScript, usesTerminal, type ActionKind } from "./types";

describe("kind predicates", () => {
  const table: [ActionKind, boolean, boolean, boolean, boolean][] = [
    ["app", true, false, false, false],
    ["script", false, true, false, true],
    ["agent", false, false, true, true],
  ];
  it.each(table)("%s", (kind, app, script, agent, terminal) => {
    expect(isApp({ kind })).toBe(app);
    expect(isScript({ kind })).toBe(script);
    expect(isAgent({ kind })).toBe(agent);
    expect(usesTerminal({ kind })).toBe(terminal);
  });
});

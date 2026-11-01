import { describe, expect, it } from "vitest";
import { normalizeAction, updateAction } from "./actions";
import { soleIconButtons } from "./actionsBar";
import type { Action } from "./types";

describe("soleIconButtons by icon", () => {
  const ag = (id: string, icon?: string): Pick<Action, "id" | "kind" | "icon"> => ({ id, kind: "agent", ...(icon ? { icon } : {}) });

  it("draws an agent as its icon alone only when no other button has the same logo", () => {
    expect(soleIconButtons([ag("a", "agent:codex"), ag("b", "agent:claude")])).toEqual(new Set(["a", "b"]));
    expect(soleIconButtons([ag("a", "agent:claude"), ag("b", "agent:claude")])).toEqual(new Set());
  });

  it("never draws a glyph, a missing icon or a script as its icon alone", () => {
    expect(soleIconButtons([ag("a", "glyph:star"), ag("b")])).toEqual(new Set());
    expect(soleIconButtons([{ id: "s", kind: "script", icon: "agent:claude" }])).toEqual(new Set());
  });
});

describe("one icon field", () => {
  it("drops appId and iconId from stored Actions", () => {
    const stored = normalizeAction({ id: "a1", name: "Zed", kind: "app", command: "zed {target}", appId: "zed", iconId: "zed", icon: "app:zed" });
    expect(stored).not.toHaveProperty("appId");
    expect(stored).not.toHaveProperty("iconId");
    expect(stored?.icon).toBe("app:zed");
  });

  it("editing the command never changes the icon", () => {
    const claude: Action = { id: "g1", name: "Claude", kind: "agent", command: "claude", icon: "agent:claude", ownButton: true };
    const next = updateAction([claude], "g1", { command: "claude --dangerously-skip-permissions" })[0];
    expect(next?.icon).toBe("agent:claude");
  });
});

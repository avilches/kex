import { describe, expect, it } from "vitest";
import { actionsSectionParam, parseActionsTarget } from "./actionsTarget";

describe("actions target", () => {
  it("builds the section parameter with the tab and, when given, the Action", () => {
    expect(actionsSectionParam("global")).toBe("actions:global");
    expect(actionsSectionParam("workspace", "ac-1")).toBe("actions:workspace:ac-1");
  });

  it("reads back what it built", () => {
    expect(parseActionsTarget("workspace:ac-1")).toEqual({ tab: "workspace", id: "ac-1" });
    expect(parseActionsTarget("global")).toEqual({ tab: "global" });
  });

  it("keeps an id that carries a colon whole", () => {
    expect(parseActionsTarget("global:a:b")).toEqual({ tab: "global", id: "a:b" });
  });

  it("knows nothing of any other tab or an empty one", () => {
    expect(parseActionsTarget(undefined)).toBeNull();
    expect(parseActionsTarget("")).toBeNull();
    expect(parseActionsTarget("scripts:x")).toBeNull();
  });
});

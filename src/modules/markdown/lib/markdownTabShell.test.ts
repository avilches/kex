import { describe, expect, it } from "vitest";
import { planModeSwitch, planSave } from "@/modules/markdown/lib/markdownTabShell";

describe("planModeSwitch", () => {
  it("leaving rich mode flushes the rich surface, saves, then swaps", () => {
    expect(planModeSwitch("rich")).toEqual({
      flushRich: true,
      saveDoc: true,
      saveSource: false,
      reload: false,
      nextMode: "source",
    });
  });

  it("leaving source mode saves the source pane, reloads, then swaps", () => {
    expect(planModeSwitch("source")).toEqual({
      flushRich: false,
      saveDoc: false,
      saveSource: true,
      reload: true,
      nextMode: "rich",
    });
  });
});

describe("planSave", () => {
  it("saves the document through the rich surface in rich mode", () => {
    expect(planSave("rich")).toEqual({ flushRich: true, saveDoc: true, saveSource: false });
  });

  it("saves through the source pane in source mode", () => {
    expect(planSave("source")).toEqual({ flushRich: false, saveDoc: false, saveSource: true });
  });
});

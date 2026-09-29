import { describe, expect, it } from "vitest";
import { nextViewMode } from "@/modules/markdown/lib/viewCycle";

describe("nextViewMode", () => {
  it("advances and wraps around", () => {
    const modes = ["source", "rich", "preview"] as const;
    expect(nextViewMode(modes, "source")).toBe("rich");
    expect(nextViewMode(modes, "rich")).toBe("preview");
    expect(nextViewMode(modes, "preview")).toBe("source");
  });

  it("toggles a two-mode engine", () => {
    expect(nextViewMode(["rich", "source"], "rich")).toBe("source");
    expect(nextViewMode(["rich", "source"], "source")).toBe("rich");
  });
});

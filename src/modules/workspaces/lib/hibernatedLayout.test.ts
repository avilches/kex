import { describe, expect, it } from "vitest";
import { hibernatedLayout } from "./hibernatedLayout";

describe("hibernatedLayout", () => {
  it("shows everything in a roomy pane", () => {
    expect(hibernatedLayout(900, 700)).toBe("full");
    expect(hibernatedLayout(440, 430)).toBe("full");
  });

  it("drops the folder and command table when the pane is narrow or short", () => {
    expect(hibernatedLayout(439, 700)).toBe("compact");
    expect(hibernatedLayout(900, 429)).toBe("compact");
    expect(hibernatedLayout(360, 300)).toBe("compact");
  });

  it("keeps only the button when the pane is very small", () => {
    expect(hibernatedLayout(359, 700)).toBe("bare");
    expect(hibernatedLayout(900, 299)).toBe("bare");
    expect(hibernatedLayout(300, 110)).toBe("bare");
  });

  it("drops the hint too when even that does not fit", () => {
    expect(hibernatedLayout(299, 700)).toBe("button");
    expect(hibernatedLayout(900, 109)).toBe("button");
    expect(hibernatedLayout(0, 0)).toBe("button");
  });
});

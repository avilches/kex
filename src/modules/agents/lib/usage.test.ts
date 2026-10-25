import { describe, expect, it } from "vitest";
import { sameUsage, usageBadge } from "./usage";

// Local time, so the clock times below hold in any time zone. 2026-10-21 is a Wednesday.
const NOW = new Date(2026, 9, 21, 10, 0).getTime();

describe("usageBadge", () => {
  it("has nothing to show without a reading", () => {
    expect(usageBadge(undefined, NOW)).toBeNull();
    expect(usageBadge({}, NOW)).toBeNull();
  });

  it("shows the context use of an API-billed session", () => {
    expect(usageBadge({ contextUsedPct: 2 }, NOW)).toEqual({
      label: "2%",
      level: "normal",
      title: "Context: 2% used",
    });
  });

  it("raises the level as the context fills up", () => {
    expect(usageBadge({ contextUsedPct: 80 }, NOW)?.level).toBe("high");
    expect(usageBadge({ contextUsedPct: 95.4 }, NOW)?.level).toBe("critical");
  });

  it("keeps the context in the tab while the limits are comfortable", () => {
    const b = usageBadge(
      {
        contextUsedPct: 30,
        fiveHour: { usedPct: 40, resetsAt: NOW / 1000 + 90 * 60 },
      },
      NOW,
    );
    expect(b?.label).toBe("30%");
    expect(b?.title).toBe(
      "Context: 30% used\n5-hour limit: 40% used, resets at 11:30",
    );
  });

  it("shows the limit that is running out instead of the context", () => {
    const b = usageBadge(
      {
        contextUsedPct: 30,
        fiveHour: { usedPct: 70 },
        sevenDay: { usedPct: 91 },
      },
      NOW,
    );
    expect(b).toMatchObject({ label: "7d 91%", level: "high" });
  });

  it("shows a limit when the context is unknown", () => {
    expect(usageBadge({ fiveHour: { usedPct: 12 } }, NOW)?.label).toBe(
      "5h 12%",
    );
  });

  it("drops a reset time already in the past", () => {
    const b = usageBadge(
      { sevenDay: { usedPct: 5, resetsAt: NOW / 1000 - 10 } },
      NOW,
    );
    expect(b?.title).toBe("Weekly limit: 5% used");
  });

  it("names the day of a reset that is not today", () => {
    const b = usageBadge(
      { sevenDay: { usedPct: 5, resetsAt: NOW / 1000 + 50 * 3600 } },
      NOW,
    );
    expect(b?.title).toBe("Weekly limit: 5% used, resets Fri 12:00");
  });
});

describe("sameUsage", () => {
  it("compares every field", () => {
    expect(sameUsage({ contextUsedPct: 2 }, { contextUsedPct: 2 })).toBe(true);
    expect(sameUsage(undefined, {})).toBe(true);
    expect(
      sameUsage({ fiveHour: { usedPct: 1 } }, { fiveHour: { usedPct: 2 } }),
    ).toBe(false);
  });
});

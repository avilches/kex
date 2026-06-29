import { describe, expect, it } from "vitest";
import {
  DEFAULT_RIGHT_PANEL_STATE,
  sanitizeRightPanelState,
} from "./windowUiState";

describe("sanitizeRightPanelState", () => {
  it("falls back to defaults when given null or undefined", () => {
    expect(sanitizeRightPanelState(null)).toEqual(DEFAULT_RIGHT_PANEL_STATE);
    expect(sanitizeRightPanelState(undefined)).toEqual(
      DEFAULT_RIGHT_PANEL_STATE,
    );
  });

  it("coerces an invalid activeTab to 'explorer'", () => {
    expect(sanitizeRightPanelState({ activeTab: "bogus" as never }).activeTab).toBe(
      "explorer",
    );
  });

  it("coerces an invalid side to 'left'", () => {
    expect(sanitizeRightPanelState({ side: "sideways" as never }).side).toBe(
      "left",
    );
  });

  it("keeps valid activeTab and side values", () => {
    const out = sanitizeRightPanelState({ activeTab: "git", side: "right" });
    expect(out.activeTab).toBe("git");
    expect(out.side).toBe("right");
  });

  it("preserves a boolean open flag and defaults non-booleans", () => {
    expect(sanitizeRightPanelState({ open: false }).open).toBe(false);
    expect(sanitizeRightPanelState({ open: "yes" as never }).open).toBe(
      DEFAULT_RIGHT_PANEL_STATE.open,
    );
  });
});

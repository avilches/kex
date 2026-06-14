import { describe, expect, test } from "vitest";
import { getShortcutLabel } from "./shortcuts";

describe("getShortcutLabel", () => {
  test("returns platform-appropriate label for tab.close with no user override", () => {
    const label = getShortcutLabel("tab.close", {});
    // On macOS the MOD_PROP is 'meta', on other platforms it's 'ctrl'
    expect(typeof label).toBe("string");
    expect(label!.length).toBeGreaterThan(0);
    expect(label).toMatch(/W/i);
  });

  test("returns null for unknown shortcut id", () => {
    // @ts-expect-error intentional invalid id
    const label = getShortcutLabel("nonexistent.id", {});
    expect(label).toBeNull();
  });

  test("respects user override binding", () => {
    const label = getShortcutLabel("tab.close", {
      "tab.close": [{ ctrl: true, key: "q" }],
    });
    expect(label).toContain("Q");
  });

  test("returns null when user override is empty array", () => {
    const label = getShortcutLabel("tab.close", {
      "tab.close": [],
    });
    expect(label).toBeNull();
  });
});

test("tab.rename has a label containing R", () => {
  const label = getShortcutLabel("tab.rename", {});
  expect(label).not.toBeNull();
  expect(label).toMatch(/R/i);
});

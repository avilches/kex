import { describe, expect, test } from "vitest";
import {
  getShortcutLabel,
  SHORTCUTS,
  matchBinding,
  type KeyBinding,
} from "./shortcuts";

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

test("tab.rename bare F2 binding matches a plain F2 keydown", () => {
  const tabRename = SHORTCUTS.find((s) => s.id === "tab.rename");
  expect(tabRename).toBeDefined();
  const f2Event = {
    key: "F2",
    code: "F2",
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
  } as KeyboardEvent;
  const matches = tabRename!.defaultBindings.some((b) =>
    matchBinding(f2Event, b, "tab.rename"),
  );
  expect(matches).toBe(true);
});

describe("matchBinding", () => {
  function createMockKeyboardEvent(
    key: string,
    options?: {
      ctrl?: boolean;
      shift?: boolean;
      alt?: boolean;
      meta?: boolean;
      code?: string;
    }
  ): Partial<KeyboardEvent> {
    return {
      key,
      ctrlKey: options?.ctrl ?? false,
      shiftKey: options?.shift ?? false,
      altKey: options?.alt ?? false,
      metaKey: options?.meta ?? false,
      code: options?.code ?? `Key${key.toUpperCase()}`,
    };
  }

  test("matchBinding for tab.selectByIndex matches correct digit binding", () => {
    const binding: KeyBinding = { meta: true, key: "5" };
    const event = createMockKeyboardEvent("5", { meta: true });
    expect(matchBinding(event as KeyboardEvent, binding, "tab.selectByIndex")).toBe(true);
  });

  test("matchBinding for tab.selectByIndex does not match different digit", () => {
    const binding: KeyBinding = { meta: true, key: "5" };
    const event = createMockKeyboardEvent("3", { meta: true });
    expect(matchBinding(event as KeyboardEvent, binding, "tab.selectByIndex")).toBe(false);
  });

  test("matchBinding for tab.selectByIndex does not match non-digit", () => {
    const binding: KeyBinding = { meta: true, key: "5" };
    const event = createMockKeyboardEvent("a", { meta: true });
    expect(matchBinding(event as KeyboardEvent, binding, "tab.selectByIndex")).toBe(false);
  });

  test("matchBinding for tab.selectByIndex respects modifier mismatch", () => {
    const binding: KeyBinding = { meta: true, key: "5" };
    const event = createMockKeyboardEvent("5", { ctrl: true });
    expect(matchBinding(event as KeyboardEvent, binding, "tab.selectByIndex")).toBe(false);
  });
});

describe("tab.selectByIndex binding uniqueness", () => {
  test("only tab.selectByIndex binds to Cmd/Ctrl+1 through Cmd/Ctrl+9", () => {
    const tabSelectByIndex = SHORTCUTS.find(
      (s) => s.id === "tab.selectByIndex"
    );
    expect(tabSelectByIndex).toBeDefined();

    const digitPattern = /^[1-9]$/;
    const otherShortcuts = SHORTCUTS.filter(
      (s) => s.id !== "tab.selectByIndex"
    );

    for (const other of otherShortcuts) {
      for (const binding of other.defaultBindings) {
        const isDigitKey = digitPattern.test(binding.key);
        const isCmdOrCtrl = binding.meta || binding.ctrl;
        const sameModifiers =
          binding.meta === tabSelectByIndex!.defaultBindings[0].meta &&
          binding.ctrl === tabSelectByIndex!.defaultBindings[0].ctrl &&
          binding.shift === tabSelectByIndex!.defaultBindings[0].shift &&
          binding.alt === tabSelectByIndex!.defaultBindings[0].alt;

        if (isDigitKey && isCmdOrCtrl && sameModifiers) {
          expect.fail(
            `${other.id} binds to Cmd/Ctrl+${binding.key}, which conflicts with tab.selectByIndex`
          );
        }
      }
    }
  });
});

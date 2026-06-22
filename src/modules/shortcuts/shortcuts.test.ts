import { describe, expect, it, test } from "vitest";
import { MOD_PROP } from "@/lib/platform";
import {
  getShortcutLabel,
  matchesShortcut,
  SHORTCUTS,
  matchBinding,
  type KeyBinding,
  type ShortcutId,
} from "./shortcuts";

function keyEvent(key: string, shift = false): KeyboardEvent {
  return {
    key,
    ctrlKey: MOD_PROP === "ctrl",
    metaKey: MOD_PROP === "meta",
    shiftKey: shift,
    altKey: false,
    repeat: false,
  } as unknown as KeyboardEvent;
}

describe("file clipboard shortcuts", () => {
  it("Mod+C matches file.copy", () => {
    expect(matchesShortcut(keyEvent("c"), "file.copy")).toBe(true);
  });
  it("Mod+Shift+C does not match file.copy", () => {
    expect(matchesShortcut(keyEvent("c", true), "file.copy")).toBe(false);
  });
  it("Mod+Shift+C still matches path.copy (no conflict)", () => {
    expect(matchesShortcut(keyEvent("c", true), "path.copy")).toBe(true);
  });
  it("Mod+X matches file.cut", () => {
    expect(matchesShortcut(keyEvent("x"), "file.cut")).toBe(true);
  });
  it("Mod+V matches file.paste", () => {
    expect(matchesShortcut(keyEvent("v"), "file.paste")).toBe(true);
  });
});

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

test("file.rename bare F2 binding matches a plain F2 keydown", () => {
  const fileRename = SHORTCUTS.find((s) => s.id === "file.rename");
  expect(fileRename).toBeDefined();
  const f2Event = {
    key: "F2",
    code: "F2",
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
  } as KeyboardEvent;
  const matches = fileRename!.defaultBindings.some((b) =>
    matchBinding(f2Event, b, "file.rename"),
  );
  expect(matches).toBe(true);
});

test("tab.rename no longer binds F2 (separated from file.rename)", () => {
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
  expect(matches).toBe(false);
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

test("path.copy shortcut is defined with Cmd/Ctrl+Shift+C binding", () => {
  const s = SHORTCUTS.find((x) => x.id === "path.copy");
  expect(s).toBeDefined();
  expect(s!.defaultBindings).toHaveLength(1);
  const b = s!.defaultBindings[0];
  expect(b.shift).toBe(true);
  expect(b.key).toBe("c");
  // meta on Mac, ctrl elsewhere -- one of them must be true
  expect(b.meta || b.ctrl).toBe(true);
});

describe("notification shortcuts", () => {
  test("notifications.toggle default binding is Cmd/Ctrl+Shift+I", () => {
    const s = SHORTCUTS.find((x) => x.id === "notifications.toggle");
    expect(s).toBeDefined();
    const b = s!.defaultBindings[0];
    expect(b.shift).toBe(true);
    expect(b.key).toBe("i");
    expect(b.meta || b.ctrl).toBe(true);
  });

  test("notifications.jumpToLast default binding is Cmd/Ctrl+I (no shift)", () => {
    const s = SHORTCUTS.find((x) => x.id === "notifications.jumpToLast");
    expect(s).toBeDefined();
    const b = s!.defaultBindings[0];
    expect(b.shift).toBeFalsy();
    expect(b.key).toBe("i");
    expect(b.meta || b.ctrl).toBe(true);
  });
});

describe("tab.lock shortcut", () => {
  test("default binding is Cmd/Ctrl+Alt+L (no shift) in the Tabs group", () => {
    const s = SHORTCUTS.find((x) => x.id === "tab.lock");
    expect(s).toBeDefined();
    expect(s!.group).toBe("Tabs");
    const b = s!.defaultBindings[0];
    expect(b.shift).toBeFalsy();
    expect(b.alt).toBe(true);
    expect(b.key).toBe("l");
    expect(b.meta || b.ctrl).toBe(true);
  });
});

test("file.delete default binding is a bare Delete key", () => {
  const s = SHORTCUTS.find((x) => x.id === "file.delete");
  expect(s).toBeDefined();
  expect(s!.group).toBe("General");
  const b = s!.defaultBindings[0];
  expect(b.key).toBe("Delete");
  expect(b.meta).toBeFalsy();
  expect(b.ctrl).toBeFalsy();
  expect(b.shift).toBeFalsy();
  expect(b.alt).toBeFalsy();
});

test("bare Delete keydown matches file.delete", () => {
  const ev = {
    key: "Delete",
    code: "Delete",
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
  } as KeyboardEvent;
  expect(matchesShortcut(ev, "file.delete")).toBe(true);
});

describe("tab.selectByIndex binding uniqueness", () => {
  // explorer.viewFilesystem/Pinned intentionally use Ctrl+1-2 on all platforms.
  // On macOS, tab.selectByIndex uses Cmd (meta) so there is no conflict.
  // On Linux/Windows both use Ctrl -- the user can reassign via Settings.
  // These are the only known exceptions.
  const DIGIT_EXCEPTIONS = new Set<ShortcutId>([
    "explorer.viewFilesystem",
    "explorer.viewPinned",
  ]);

  test("only tab.selectByIndex and known explorer.view* bind to Cmd/Ctrl+1-9", () => {
    const tabSelectByIndex = SHORTCUTS.find(
      (s) => s.id === "tab.selectByIndex"
    );
    expect(tabSelectByIndex).toBeDefined();

    const digitPattern = /^[1-9]$/;
    const otherShortcuts = SHORTCUTS.filter(
      (s) => s.id !== "tab.selectByIndex" && !DIGIT_EXCEPTIONS.has(s.id)
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

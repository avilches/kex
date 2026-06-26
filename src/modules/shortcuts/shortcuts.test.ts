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

  test("matchBinding for tab.selectByIndex matches any digit (wildcard)", () => {
    // The binding digit is just representative; any 0-9 with the same modifiers
    // is a hit, the handler reads e.key for the actual index.
    const binding: KeyBinding = { meta: true, key: "5" };
    const event = createMockKeyboardEvent("3", { meta: true });
    expect(matchBinding(event as KeyboardEvent, binding, "tab.selectByIndex")).toBe(true);
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

function digitEvent(
  key: string,
  mods: { meta?: boolean; ctrl?: boolean },
): KeyboardEvent {
  return {
    key,
    code: `Digit${key}`,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    shiftKey: false,
    altKey: false,
    repeat: false,
  } as unknown as KeyboardEvent;
}

describe("terminal.scratchpad shortcut", () => {
  it("is registered in SHORTCUTS", () => {
    const sc = SHORTCUTS.find((s) => s.id === "terminal.scratchpad");
    expect(sc).toBeDefined();
    expect(sc?.group).toBe("Terminal");
  });
});

describe("index shortcut digit families", () => {
  // workspace.selectByIndex (Cmd/meta + 1-9) and tab.selectByIndex (Ctrl + 0-9)
  // own the digit space via wildcard matching. On macOS this is conflict-free
  // (Cmd vs Ctrl are distinct). On Windows/Linux MOD_PROP is Ctrl, so Ctrl+0
  // (last tab) overlaps view.zoomReset; tab wins by registration order and
  // Reset Zoom stays reassignable. That single overlap is the one known
  // exception, excluded below.
  const KNOWN_DIGIT_OVERLAP = new Set<ShortcutId>(["view.zoomReset"]);

  test("no unexpected shortcut collides with the index digit families", () => {
    const digit = /^[0-9]$/;
    for (const s of SHORTCUTS) {
      if (
        s.id === "workspace.selectByIndex" ||
        s.id === "tab.selectByIndex" ||
        KNOWN_DIGIT_OVERLAP.has(s.id)
      )
        continue;
      for (const b of s.defaultBindings) {
        if (!digit.test(b.key)) continue;
        const wsFamily =
          !!b.meta && !b.ctrl && !b.alt && !b.shift && /^[1-9]$/.test(b.key);
        const tabFamily = !!b.ctrl && !b.meta && !b.alt && !b.shift;
        if (wsFamily)
          expect.fail(
            `${s.id} binds Cmd+${b.key}, conflicts with workspace.selectByIndex`,
          );
        if (tabFamily)
          expect.fail(
            `${s.id} binds Ctrl+${b.key}, conflicts with tab.selectByIndex`,
          );
      }
    }
  });

  test("Cmd+1..9 select a workspace, Cmd+0 does not (left for Reset Zoom)", () => {
    expect(matchesShortcut(digitEvent("1", { meta: true }), "workspace.selectByIndex")).toBe(true);
    expect(matchesShortcut(digitEvent("9", { meta: true }), "workspace.selectByIndex")).toBe(true);
    expect(matchesShortcut(digitEvent("0", { meta: true }), "workspace.selectByIndex")).toBe(false);
  });

  test("Ctrl+0..9 select a tab (0 = last)", () => {
    expect(matchesShortcut(digitEvent("1", { ctrl: true }), "tab.selectByIndex")).toBe(true);
    expect(matchesShortcut(digitEvent("9", { ctrl: true }), "tab.selectByIndex")).toBe(true);
    expect(matchesShortcut(digitEvent("0", { ctrl: true }), "tab.selectByIndex")).toBe(true);
  });

  test("digit families do not cross modifiers", () => {
    expect(matchesShortcut(digitEvent("1", { meta: true }), "tab.selectByIndex")).toBe(false);
    expect(matchesShortcut(digitEvent("1", { ctrl: true }), "workspace.selectByIndex")).toBe(false);
  });
});

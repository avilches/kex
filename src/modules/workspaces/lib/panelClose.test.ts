import { describe, expect, test } from "vitest";
import { isBulkClosable } from "./panelClose";
import type { Panel } from "./types";

describe("isBulkClosable", () => {
  test("locked terminal tabs are protected from bulk close", () => {
    const panel: Panel = { id: "t1", kind: "terminal", locked: true };
    expect(isBulkClosable(panel)).toBe(false);
  });

  test("unlocked terminal tabs can be bulk closed", () => {
    const panel: Panel = { id: "t2", kind: "terminal", locked: false };
    expect(isBulkClosable(panel)).toBe(true);
  });

  test("terminal tabs without an explicit lock flag can be bulk closed", () => {
    const panel: Panel = { id: "t3", kind: "terminal" };
    expect(isBulkClosable(panel)).toBe(true);
  });

  test("non-terminal panels are never lockable, always bulk closable", () => {
    const editor: Panel = { id: "e1", kind: "editor", path: "/a.ts", dirty: false, preview: false };
    const preview: Panel = { id: "p1", kind: "preview", url: "http://localhost" };
    expect(isBulkClosable(editor)).toBe(true);
    expect(isBulkClosable(preview)).toBe(true);
  });
});

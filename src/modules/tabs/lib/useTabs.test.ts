import { describe, expect, test } from "vitest";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("Tab ID format", () => {
  test("crypto.randomUUID produces valid v4 UUIDs", () => {
    const id = crypto.randomUUID();
    expect(UUID_RE.test(id)).toBe(true);
  });

  test("each call produces a unique ID", () => {
    const ids = Array.from({ length: 20 }, () => crypto.randomUUID());
    const unique = new Set(ids);
    expect(unique.size).toBe(20);
  });
});

import { describe, expect, it } from "vitest";
import {
  PERMISSION_KINDS,
  permissionAction,
  summarizePermissions,
  type PermissionKind,
  type PermissionRow,
} from "./permissions";

function rows(over: Partial<Record<PermissionKind, PermissionRow>>) {
  const base = Object.fromEntries(
    PERMISSION_KINDS.map((k) => [k, "unchecked"]),
  ) as Record<PermissionKind, PermissionRow>;
  return { ...base, ...over };
}

describe("permissionAction", () => {
  it("unchecked offers a check", () => {
    expect(permissionAction("unchecked")).toBe("check");
  });
  it("denied offers the system settings", () => {
    expect(permissionAction("denied")).toBe("openSettings");
  });
  it("the rest offers nothing", () => {
    for (const r of ["checking", "granted", "unavailable"] as const) {
      expect(permissionAction(r)).toBe("none");
    }
  });
});

describe("summarizePermissions", () => {
  it("summarizePermissions ignores unavailable", () => {
    expect(
      summarizePermissions(
        rows({
          desktop: "granted",
          documents: "denied",
          icloud: "unavailable",
          fullDisk: "checking",
        }),
      ),
    ).toEqual({ granted: 1, denied: 1, unchecked: 1 });
  });
});

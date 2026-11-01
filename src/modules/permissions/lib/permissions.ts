export const PERMISSION_KINDS = [
  "desktop",
  "documents",
  "downloads",
  "icloud",
  "fullDisk",
] as const;

export type PermissionKind = (typeof PERMISSION_KINDS)[number];
export type ProbeState = "granted" | "denied" | "unavailable";
export type PermissionRow = "unchecked" | "checking" | ProbeState;

export const PERMISSION_LABELS: Record<PermissionKind, string> = {
  desktop: "Desktop",
  documents: "Documents",
  downloads: "Downloads",
  icloud: "iCloud Drive",
  fullDisk: "Full Disk Access",
};

export function permissionAction(row: PermissionRow): "check" | "openSettings" | "none" {
  if (row === "unchecked") return "check";
  if (row === "denied") return "openSettings";
  return "none";
}

export function summarizePermissions(rows: Record<PermissionKind, PermissionRow>): {
  granted: number;
  denied: number;
  unchecked: number;
} {
  const out = { granted: 0, denied: 0, unchecked: 0 };
  for (const kind of PERMISSION_KINDS) {
    const row = rows[kind];
    if (row === "granted") out.granted++;
    else if (row === "denied") out.denied++;
    else if (row === "unchecked") out.unchecked++;
  }
  return out;
}

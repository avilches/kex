import { PermissionsList } from "@/modules/permissions";

export function PermissionsStep() {
  return (
    <div className="flex flex-col gap-3">
      <PermissionsList compact />
      <p className="text-[12px] text-muted-foreground">
        Checking a folder for the first time may show a macOS prompt. If you already said no, macOS
        will not ask again: open System Settings to allow it there.
      </p>
    </div>
  );
}

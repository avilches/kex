import { PermissionsList } from "@/modules/permissions";
import { SectionHeader } from "../components/SectionHeader";

export function PermissionsSection() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Permissions" />
      <PermissionsList />
    </div>
  );
}

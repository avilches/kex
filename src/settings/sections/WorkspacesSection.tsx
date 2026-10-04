import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setRandomWorkspaceColor, setWarnOnCloseWorkspace } from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function WorkspacesSection() {
  const warnOnCloseWorkspace = usePreferencesStore((s) => s.warnOnCloseWorkspace);
  const randomWorkspaceColor = usePreferencesStore((s) => s.randomWorkspaceColor);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Workspace" />

      <div className="flex flex-col gap-2">
        <SettingRow
          title="Warn when closing a workspace"
          description="Confirm before closing a workspace and its tabs."
        >
          <Switch
            checked={warnOnCloseWorkspace}
            onCheckedChange={(v) => void setWarnOnCloseWorkspace(v)}
          />
        </SettingRow>
        <SettingRow
          title="Set a random color to new workspaces"
          description="Assign a color automatically when a new workspace is created."
        >
          <Switch
            checked={randomWorkspaceColor}
            onCheckedChange={(v) => void setRandomWorkspaceColor(v)}
          />
        </SettingRow>
      </div>
    </div>
  );
}

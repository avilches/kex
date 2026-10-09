import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setRandomWorkspaceColor,
  setWarnOnCloseWorkspace,
  setWorkspaceDetail,
} from "@/modules/settings/store";
import {
  WORKSPACE_DETAIL_LABELS,
  WORKSPACE_DETAIL_MODES,
  type WorkspaceDetailMode,
} from "@/modules/workspaces/lib/workspaceDetail";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function WorkspacesSection() {
  const warnOnCloseWorkspace = usePreferencesStore((s) => s.warnOnCloseWorkspace);
  const randomWorkspaceColor = usePreferencesStore((s) => s.randomWorkspaceColor);
  const workspaceDetail = usePreferencesStore((s) => s.workspaceDetail);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Workspaces" />

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
        <SettingRow
          title="Detail under each workspace"
          description="What the expand arrow of a workspace in the bar lists below it. With None, the bar only shows the number of active agents."
        >
          <RadioGroup
            value={workspaceDetail}
            onValueChange={(v) => void setWorkspaceDetail(v as WorkspaceDetailMode)}
          >
            {WORKSPACE_DETAIL_MODES.map((mode) => (
              <div key={mode} className="flex items-center gap-2">
                <RadioGroupItem value={mode} id={`workspace-detail-${mode}`} />
                <label
                  htmlFor={`workspace-detail-${mode}`}
                  className="cursor-pointer text-[12px]"
                >
                  {WORKSPACE_DETAIL_LABELS[mode]}
                </label>
              </div>
            ))}
          </RadioGroup>
        </SettingRow>
      </div>
    </div>
  );
}

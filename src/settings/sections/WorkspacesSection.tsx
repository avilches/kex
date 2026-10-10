import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setRandomWorkspaceColor,
  setWarnOnCloseWorkspace,
  setWorkspaceDetailBrowsers,
  setWorkspaceDetailEditors,
  setWorkspaceDetailEnabled,
  setWorkspaceDetailGit,
  setWorkspaceDetailTerminals,
} from "@/modules/settings/store";
import {
  TERMINAL_DETAIL_LABELS,
  TERMINAL_DETAIL_MODES,
  type TerminalDetail,
} from "@/modules/workspaces/lib/workspaceDetail";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function WorkspacesSection() {
  const warnOnCloseWorkspace = usePreferencesStore((s) => s.warnOnCloseWorkspace);
  const randomWorkspaceColor = usePreferencesStore((s) => s.randomWorkspaceColor);
  const detailEnabled = usePreferencesStore((s) => s.workspaceDetailEnabled);
  const detailTerminals = usePreferencesStore((s) => s.workspaceDetailTerminals);
  const detailEditors = usePreferencesStore((s) => s.workspaceDetailEditors);
  const detailBrowsers = usePreferencesStore((s) => s.workspaceDetailBrowsers);
  const detailGit = usePreferencesStore((s) => s.workspaceDetailGit);

  const otherKinds: {
    id: string;
    label: string;
    checked: boolean;
    onChange: (v: boolean) => Promise<void>;
  }[] = [
    { id: "editors", label: "Include editors", checked: detailEditors, onChange: setWorkspaceDetailEditors },
    { id: "browsers", label: "Include browsers", checked: detailBrowsers, onChange: setWorkspaceDetailBrowsers },
    { id: "git", label: "Include git diffs", checked: detailGit, onChange: setWorkspaceDetailGit },
  ];

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
          title="Show tabs under each workspace"
          description="Adds an expand arrow to each workspace in the bar. The number of active agents is always shown."
        >
          <Switch
            checked={detailEnabled}
            onCheckedChange={(v) => void setWorkspaceDetailEnabled(v)}
          />
        </SettingRow>
        {detailEnabled && (
          <>
            <SettingRow
              title="Terminals"
              description="Which terminals the expand arrow lists."
            >
              <RadioGroup
                value={detailTerminals}
                onValueChange={(v) => void setWorkspaceDetailTerminals(v as TerminalDetail)}
              >
                {TERMINAL_DETAIL_MODES.map((mode) => (
                  <div key={mode} className="flex items-center gap-2">
                    <RadioGroupItem value={mode} id={`workspace-detail-${mode}`} />
                    <label
                      htmlFor={`workspace-detail-${mode}`}
                      className="cursor-pointer text-[12px]"
                    >
                      {TERMINAL_DETAIL_LABELS[mode]}
                    </label>
                  </div>
                ))}
              </RadioGroup>
            </SettingRow>
            <SettingRow
              title="Other tabs"
              description="Also list these tabs, whatever the terminals option. Editors include markdown and html."
            >
              <div className="flex flex-col gap-2">
                {otherKinds.map((k) => (
                  <div key={k.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`workspace-detail-${k.id}`}
                      checked={k.checked}
                      onCheckedChange={(v) => void k.onChange(v === true)}
                    />
                    <label
                      htmlFor={`workspace-detail-${k.id}`}
                      className="cursor-pointer text-[12px]"
                    >
                      {k.label}
                    </label>
                  </div>
                ))}
              </div>
            </SettingRow>
          </>
        )}
      </div>
    </div>
  );
}

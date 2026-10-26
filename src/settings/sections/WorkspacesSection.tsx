import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setRandomWorkspaceColor,
  setWorkspaceDetailBrowsers,
  setWorkspaceDetailEditors,
  setWorkspaceDetailGit,
  setWorkspaceDetailTerminals,
  setWorkspaceDetailTerminalsEnabled,
} from "@/modules/settings/store";
import {
  TERMINAL_DETAIL_LABELS,
  TERMINAL_DETAIL_MODES,
  type TerminalDetail,
} from "@/modules/workspaces/lib/workspaceDetail";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function WorkspacesSection() {
  const randomWorkspaceColor = usePreferencesStore((s) => s.randomWorkspaceColor);
  const terminalsEnabled = usePreferencesStore((s) => s.workspaceDetailTerminalsEnabled);
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
          title="Set a random color to new workspaces"
          description="Assign a color automatically when a new workspace is created."
        >
          <Switch
            checked={randomWorkspaceColor}
            onCheckedChange={(v) => void setRandomWorkspaceColor(v)}
          />
        </SettingRow>
        <SettingRow
          title="Tabs under each workspace"
          description="Which tabs the expand arrow of each workspace lists. With nothing included there is no arrow. The number of active agents is always shown. Editors include markdown and html."
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="workspace-detail-terminals"
                checked={terminalsEnabled}
                onCheckedChange={(v) => void setWorkspaceDetailTerminalsEnabled(v === true)}
              />
              <label
                htmlFor="workspace-detail-terminals"
                className="cursor-pointer text-[12px]"
              >
                Include terminals
              </label>
            </div>
            <RadioGroup
              className="ml-6"
              value={detailTerminals}
              onValueChange={(v) => void setWorkspaceDetailTerminals(v as TerminalDetail)}
            >
              {TERMINAL_DETAIL_MODES.map((mode) => (
                <div
                  key={mode}
                  className={`flex items-center gap-2 ${terminalsEnabled ? "" : "opacity-50"}`}
                >
                  <RadioGroupItem
                    value={mode}
                    id={`workspace-detail-${mode}`}
                    disabled={!terminalsEnabled}
                  />
                  <label
                    htmlFor={`workspace-detail-${mode}`}
                    className={`text-[12px] ${terminalsEnabled ? "cursor-pointer" : ""}`}
                  >
                    {TERMINAL_DETAIL_LABELS[mode]}
                  </label>
                </div>
              ))}
            </RadioGroup>
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
      </div>
    </div>
  );
}

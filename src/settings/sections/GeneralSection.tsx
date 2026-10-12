import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  type AutofocusMode,
  setAgentNotifications,
  setAutofocusMode,
  setAutofocusNewTabs,
  setAutostart,
  setPreviewOnClick,
} from "@/modules/settings/store";
import { cn } from "@/lib/utils";
import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  CrosshairIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useState } from "react";
import { FieldLabel } from "../components/FieldLabel";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function GeneralSection() {
  const autostart = usePreferencesStore((s) => s.autostart);
  const autofocusMode = usePreferencesStore((s) => s.autofocusMode);
  const autofocusNewTabs = usePreferencesStore((s) => s.autofocusNewTabs);
  const previewOnClick = usePreferencesStore((s) => s.previewOnClick);
  const [hooksInstalled, setHooksInstalled] = useState<boolean | null>(null);
  const [agentNotifsInstalling, setAgentNotifsInstalling] = useState(false);
  const [agentNotifsError, setAgentNotifsError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    invoke<boolean>("agent_claude_hooks_status")
      .then((on) => alive && setHooksInstalled(on))
      .catch(() => alive && setHooksInstalled(false));
    return () => {
      alive = false;
    };
  }, []);

  const onChangeIntegration = async (install: boolean) => {
    setAgentNotifsInstalling(true);
    setAgentNotifsError(null);
    try {
      await invoke(install ? "agent_enable_claude_hooks" : "agent_disable_claude_hooks");
      await setAgentNotifications(install);
      setHooksInstalled(install);
    } catch (e) {
      setAgentNotifsError(
        install
          ? "Could not install the hooks in ~/.claude/settings.json."
          : "Could not remove the hooks from ~/.claude/settings.json.",
      );
      console.error("[kex] agent hooks change failed:", e);
    } finally {
      setAgentNotifsInstalling(false);
    }
  };

  useEffect(() => {
    let alive = true;
    void isEnabled()
      .then((on) => {
        if (!alive) return;
        if (on !== usePreferencesStore.getState().autostart) {
          void setAutostart(on);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const onToggleAutostart = async (next: boolean) => {
    try {
      if (next) await enable();
      else await disable();
      await setAutostart(next);
    } catch (e) {
      console.error("autostart toggle failed", e);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="General" />

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[12.5px] font-medium">
              Autofocus{"  "}
              <span className="inline-flex translate-y-[2px] text-primary">
                <HugeiconsIcon icon={CrosshairIcon} size={14} strokeWidth={2} />
              </span>
            </span>
            <span className="text-[10.5px] leading-relaxed text-muted-foreground">
              Tabs with autofocus refresh the sidebar when selected.
            </span>
          </div>
          <RadioGroup
            className="gap-2"
            value={autofocusMode}
            onValueChange={(v) => void setAutofocusMode(v as AutofocusMode)}
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem value="manual" id="autofocus-manual" className="mt-0.5" />
              <label htmlFor="autofocus-manual" className="cursor-pointer text-[12px]">
                Manual{" "}
                <span className="text-[10.5px] text-muted-foreground">
                  Only tabs where you turn it on from their context menu
                </span>
              </label>
            </div>
            {autofocusMode === "manual" && (
              <div className="ml-6 flex items-center gap-2">
                <Checkbox
                  id="autofocus-new-tabs"
                  checked={autofocusNewTabs}
                  onCheckedChange={(v) => void setAutofocusNewTabs(v === true)}
                />
                <label htmlFor="autofocus-new-tabs" className="cursor-pointer text-[12px]">
                  Enable autofocus on new tabs
                </label>
              </div>
            )}
            <div className="flex items-start gap-2">
              <RadioGroupItem value="always" id="autofocus-always" className="mt-0.5" />
              <label htmlFor="autofocus-always" className="cursor-pointer text-[12px]">
                Always{" "}
                <span className="text-[10.5px] text-muted-foreground">
                  Every tab refreshes the sidebar when selected; per-tab toggles are hidden but each tab keeps its saved setting
                </span>
              </label>
            </div>
          </RadioGroup>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Explorer</FieldLabel>
        <SettingRow
          title="Click for preview"
          description="Single click opens file in a temporary preview tab."
        >
          <Switch
            checked={previewOnClick}
            onCheckedChange={(v) => void setPreviewOnClick(v)}
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Agents</FieldLabel>
        <SettingRow
          title={
            <span className="flex items-center gap-1.5">
              Kex integration
              {hooksInstalled !== null && (
                <span
                  className={cn(
                    "flex items-center gap-1 text-[11px] font-normal",
                    hooksInstalled ? "text-green-500" : "text-destructive",
                  )}
                >
                  <HugeiconsIcon
                    icon={hooksInstalled ? CheckmarkCircle02Icon : CancelCircleIcon}
                    size={12}
                    strokeWidth={2}
                  />
                  {hooksInstalled ? "Installed" : "Not installed"}
                </span>
              )}
            </span>
          }
          description={
            hooksInstalled
              ? "Claude Code hooks are active: Kex restores your Claude sessions and notifies you in the tab bar when Claude needs input or finishes. Entries live in ~/.claude/settings.json."
              : "Install the Claude Code hooks so Kex can restore your Claude sessions when you reopen it and notify you in the tab bar when Claude needs input or finishes. Adds entries to ~/.claude/settings.json."
          }
        >
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-[11px]"
            disabled={agentNotifsInstalling || hooksInstalled === null}
            onClick={() => void onChangeIntegration(!hooksInstalled)}
          >
            {hooksInstalled
              ? agentNotifsInstalling
                ? "Uninstalling..."
                : "Uninstall"
              : agentNotifsInstalling
                ? "Installing..."
                : "Install"}
          </Button>
        </SettingRow>
        {agentNotifsError && (
          <p className="text-[11px] text-destructive">{agentNotifsError}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Startup</FieldLabel>
        <SettingRow
          title="Launch at login"
          description="Open Kex automatically when you sign in."
        >
          <Switch
            checked={autostart}
            onCheckedChange={(v) => void onToggleAutostart(v)}
          />
        </SettingRow>
      </div>
    </div>
  );
}

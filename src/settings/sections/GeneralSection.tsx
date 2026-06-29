import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAgentNotifications,
  setAutofocusNewTabs,
  setAutostart,
  setPreviewOnClick,
  setWarnOnCloseWorkspace,
} from "@/modules/settings/store";
import { CrosshairIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useState } from "react";
import { FieldLabel } from "../components/FieldLabel";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function GeneralSection() {
  const autostart = usePreferencesStore((s) => s.autostart);
  const autofocusNewTabs = usePreferencesStore((s) => s.autofocusNewTabs);
  const previewOnClick = usePreferencesStore((s) => s.previewOnClick);
  const agentNotifications = usePreferencesStore((s) => s.agentNotifications);
  const warnOnCloseWorkspace = usePreferencesStore(
    (s) => s.warnOnCloseWorkspace,
  );
  const [agentNotifsInstalling, setAgentNotifsInstalling] = useState(false);
  const [agentNotifsError, setAgentNotifsError] = useState<string | null>(null);

  const onToggleAgentNotifications = async (next: boolean) => {
    setAgentNotifsInstalling(true);
    setAgentNotifsError(null);
    try {
      if (next) {
        await invoke("agent_enable_claude_hooks");
      } else {
        await invoke("agent_disable_claude_hooks");
      }
      await setAgentNotifications(next);
    } catch (e) {
      setAgentNotifsError(next ? "Could not install hooks in Claude Code config." : "Could not remove hooks from Claude Code config.");
      console.error("[kex] agent hooks toggle failed:", e);
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
        <SettingRow
          title={
            <>
              Enable autofocus in new tabs{"  "}
              <span className="inline-flex translate-y-[2px] text-primary">
                <HugeiconsIcon icon={CrosshairIcon} size={14} strokeWidth={2} />
              </span>
            </>
          }
          description="Tabs with autofocus refresh the sidebar when selected. You can toggle autofocus per tab from its context menu."
        >
          <Switch
            checked={autofocusNewTabs}
            onCheckedChange={(v) => void setAutofocusNewTabs(v)}
          />
        </SettingRow>
        <SettingRow
          title="Warn when closing a workspace"
          description="Confirm before closing a workspace and its tabs."
        >
          <Switch
            checked={warnOnCloseWorkspace}
            onCheckedChange={(v) => void setWarnOnCloseWorkspace(v)}
          />
        </SettingRow>
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
          title="Claude Code hooks for Kex"
          description="Saves and restores sessions on close, and shows notifications in the tab bar when Claude needs input or finishes. Installs hooks in ~/.claude/settings.json."
        >
          <Switch
            checked={agentNotifications}
            disabled={agentNotifsInstalling}
            onCheckedChange={(v) => void onToggleAgentNotifications(v)}
          />
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

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useShortcutLabel } from "@/modules/shortcuts/useShortcutLabel";
import {
  type AutofocusMode,
  setAutofocusMode,
  setAutostart,
  setPerformanceProfiler,
  setPreviewOnClick,
} from "@/modules/settings/store";
import { CrosshairIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect } from "react";
import { FieldLabel } from "../components/FieldLabel";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function GeneralSection() {
  const autostart = usePreferencesStore((s) => s.autostart);
  const focusShortcut = useShortcutLabel("tab.focusOnExplorer");
  const autofocusMode = usePreferencesStore((s) => s.autofocusMode);
  const previewOnClick = usePreferencesStore((s) => s.previewOnClick);
  const performanceProfiler = usePreferencesStore((s) => s.performanceProfiler);
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
              Autofocus
            </span>
            <span className="text-[10.5px] leading-relaxed text-muted-foreground">
              Autofocus refreshes the explorer with the terminal current folder changes with <code className="font-mono">cd</code> commands.
            </span>
          </div>
          <RadioGroup
            className="gap-2"
            value={autofocusMode}
            onValueChange={(v) => void setAutofocusMode(v as AutofocusMode)}
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem value="always" id="autofocus-always" className="mt-0.5" />
              <label htmlFor="autofocus-always" className="cursor-pointer text-[12px]">
                Always{" "}
                <span className="text-[10.5px] text-muted-foreground">
                  Every tab refreshes the file explorer when selected.
                </span>
              </label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="noRoot" id="autofocus-no-root" className="mt-0.5" />
              <label htmlFor="autofocus-no-root" className="cursor-pointer text-[12px]">
                Only if no workspace root is defined
              </label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="manual" id="autofocus-manual" className="mt-0.5" />
              <label htmlFor="autofocus-manual" className="cursor-pointer text-[12px]">
                Manual{" "}
                <span className="text-[10.5px] text-muted-foreground">
                  Click on{" "}
                  <HugeiconsIcon
                    icon={CrosshairIcon}
                    size={11}
                    strokeWidth={2}
                    className="inline-block -translate-y-px"
                  />{" "}
                  on explorer{focusShortcut ? ` or press ${focusShortcut}` : ""}.
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

      <div className="flex flex-col gap-2">
        <FieldLabel>Diagnostics</FieldLabel>
        <SettingRow
          title="Performance profiler"
          description="Writes a [profiler] line to Kex.log every 10 seconds with frame timings and what the page is doing. Stays on across restarts and costs a little CPU while on."
        >
          <Switch
            checked={performanceProfiler}
            onCheckedChange={(v) => void setPerformanceProfiler(v)}
          />
        </SettingRow>
      </div>
    </div>
  );
}

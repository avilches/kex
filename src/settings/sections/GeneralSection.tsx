import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  CURSOR_INACTIVE_STYLES,
  CURSOR_STYLES,
  type CursorInactiveStyle,
  type CursorStyle,
  SCROLL_SENSITIVITY_DEFAULT,
  SCROLL_SENSITIVITY_MAX,
  SCROLL_SENSITIVITY_MIN,
  SCROLL_SENSITIVITY_STEP,
  CURSOR_WIDTH_MAX,
  CURSOR_WIDTH_MIN,
  EDITOR_BLINK_RATE_DEFAULT,
  EDITOR_BLINK_RATE_MAX,
  EDITOR_BLINK_RATE_MIN,
  EDITOR_BLINK_RATE_STEP,
  TERMINAL_SCROLLBACK_PRESETS,
  setAgentNotifications,
  setAutofocusNewTabs,
  setAutostart,
  setEditorAutoSave,
  setEditorAutocompletion,
  setEditorBracketMatching,
  setEditorCloseBrackets,
  setEditorCursorBlink,
  setEditorCursorBlinkRate,
  setEditorCursorStyle,
  setEditorPreviewOnClick,
  setEditorScrollPastEnd,
  setTerminalCursorBlink,
  setTerminalCursorInactiveStyle,
  setTerminalCursorStyle,
  setTerminalCursorWidth,
  setTerminalScrollSensitivity,
  setTerminalScrollback,
  setTerminalWebglEnabled,
  setWarnOnCloseTabWithRunningProcess,
} from "@/modules/settings/store";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";
import { SliderRow } from "../components/SliderRow";

// A tiny cell that mimics how the cursor looks for each xterm style.
function CursorGlyph({
  kind,
}: {
  kind: CursorStyle | CursorInactiveStyle;
}) {
  if (kind === "none") {
    return (
      <span className="ml-auto text-[10px] text-muted-foreground/70">off</span>
    );
  }
  const shape: Record<Exclude<CursorInactiveStyle, "none">, string> = {
    bar: "border-l-2 border-current",
    block: "bg-current",
    underline: "border-b-2 border-current",
    outline: "border border-current",
  };
  return (
    <span
      aria-hidden
      className={cn(
        "ml-auto inline-block h-3.5 w-2.5 text-foreground/70",
        shape[kind],
      )}
    />
  );
}

export function GeneralSection() {
  const autostart = usePreferencesStore((s) => s.autostart);
  const autofocusNewTabs = usePreferencesStore((s) => s.autofocusNewTabs);
  const editorAutoSave = usePreferencesStore((s) => s.editorAutoSave);
  const editorPreviewOnClick = usePreferencesStore((s) => s.editorPreviewOnClick);
  const terminalWebglEnabled = usePreferencesStore(
    (s) => s.terminalWebglEnabled,
  );
  const terminalCursorBlink = usePreferencesStore(
    (s) => s.terminalCursorBlink,
  );
  const terminalScrollback = usePreferencesStore((s) => s.terminalScrollback);
  const terminalCursorStyle = usePreferencesStore((s) => s.terminalCursorStyle);
  const terminalCursorInactiveStyle = usePreferencesStore(
    (s) => s.terminalCursorInactiveStyle,
  );
  const terminalCursorWidth = usePreferencesStore(
    (s) => s.terminalCursorWidth,
  );
  const terminalScrollSensitivity = usePreferencesStore(
    (s) => s.terminalScrollSensitivity,
  );
  const warnOnCloseRunning = usePreferencesStore(
    (s) => s.warnOnCloseTabWithRunningProcess,
  );
  const agentNotifications = usePreferencesStore((s) => s.agentNotifications);
  const editorScrollPastEnd = usePreferencesStore((s) => s.editorScrollPastEnd);
  const editorBracketMatching = usePreferencesStore((s) => s.editorBracketMatching);
  const editorCloseBrackets = usePreferencesStore((s) => s.editorCloseBrackets);
  const editorAutocompletion = usePreferencesStore((s) => s.editorAutocompletion);
  const editorCursorBlink = usePreferencesStore((s) => s.editorCursorBlink);
  const editorCursorBlinkRate = usePreferencesStore((s) => s.editorCursorBlinkRate);
  const editorCursorStyle = usePreferencesStore((s) => s.editorCursorStyle);
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
      <SectionHeader
        title="General"
        description="Mode, editor, and startup."
      />

      <div className="flex flex-col gap-2">
        <SettingRow
          title="Enable autofocus in new tabs"
          description="Tabs with autofocus refresh the sidebar when selected. You can toggle autofocus per tab from its context menu."
        >
          <Switch
            checked={autofocusNewTabs}
            onCheckedChange={(v) => void setAutofocusNewTabs(v)}
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Editor</Label>
        <SettingRow
          title="Auto save"
          description="Save files when editor loses focus, tab or app closes and every X seconds."
        >
          <Switch
            checked={editorAutoSave}
            onCheckedChange={(v) => void setEditorAutoSave(v)}
          />
        </SettingRow>
        <SettingRow title="Scroll past end" description="Allow scrolling beyond the last line.">
          <Switch checked={editorScrollPastEnd} onCheckedChange={(v) => void setEditorScrollPastEnd(v)} />
        </SettingRow>
        <SettingRow title="Bracket matching" description="Highlight the bracket matching the one at the cursor.">
          <Switch checked={editorBracketMatching} onCheckedChange={(v) => void setEditorBracketMatching(v)} />
        </SettingRow>
        <SettingRow title="Auto close brackets" description="Insert the closing bracket/quote automatically.">
          <Switch checked={editorCloseBrackets} onCheckedChange={(v) => void setEditorCloseBrackets(v)} />
        </SettingRow>
        <SettingRow title="Autocompletion" description="Show completion suggestions while typing.">
          <Switch checked={editorAutocompletion} onCheckedChange={(v) => void setEditorAutocompletion(v)} />
        </SettingRow>
        <SettingRow title="Cursor blinking" description="Blink the editor cursor.">
          <Switch checked={editorCursorBlink} onCheckedChange={(v) => void setEditorCursorBlink(v)} />
        </SettingRow>
        {editorCursorBlink && (
          <SliderRow
            title="Cursor blink rate"
            description="Blink period of the editor caret. Lower is faster."
            value={editorCursorBlinkRate}
            min={EDITOR_BLINK_RATE_MIN}
            max={EDITOR_BLINK_RATE_MAX}
            step={EDITOR_BLINK_RATE_STEP}
            defaultValue={EDITOR_BLINK_RATE_DEFAULT}
            format={(v) => `${v} ms`}
            onChange={(v) => void setEditorCursorBlinkRate(v)}
          />
        )}
        <SettingRow title="Cursor style" description="Editor caret shape.">
          <Select value={editorCursorStyle} onValueChange={(v) => void setEditorCursorStyle(v as CursorStyle)}>
            <SelectTrigger size="sm" className="h-8 w-28 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURSOR_STYLES.map((style) => (
                <SelectItem
                  key={style}
                  value={style}
                  className="text-[12px] [&>span:last-child]:w-full"
                >
                  <span className="capitalize">{style}</span>
                  <CursorGlyph kind={style} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Explorer</Label>
        <SettingRow
          title="Click for preview"
          description="Single click opens file in a temporary preview tab."
        >
          <Switch
            checked={editorPreviewOnClick}
            onCheckedChange={(v) => void setEditorPreviewOnClick(v)}
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Terminal</Label>
        <SettingRow
          title={
            <span className="inline-flex items-center gap-1.5">
              Use WebGL renderer
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="cursor-help text-[11px] text-muted-foreground/70 leading-none"
                      aria-label="More info about WebGL renderer"
                    >
                      ⓘ
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-65 text-[11px]"
                  >
                    xterm's WebGL renderer caches glyphs in a GPU texture
                    atlas. On some macOS setups (especially with Nerd Fonts),
                    the atlas corrupts and terminal text becomes unreadable.
                    Turn this off as a fallback — performance dips slightly,
                    but text renders correctly via the DOM renderer.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          }
          description="Hardware-accelerated rendering. Turn off if text shows corruption or blank tiles."
        >
          <Switch
            checked={terminalWebglEnabled}
            onCheckedChange={(v) => void setTerminalWebglEnabled(v)}
          />
        </SettingRow>
        <SettingRow
          title="Cursor blinking"
          description="Blink the terminal cursor. Off by default for lower idle CPU, matching VS Code and the macOS terminal."
        >
          <Switch
            checked={terminalCursorBlink}
            onCheckedChange={(v) => void setTerminalCursorBlink(v)}
          />
        </SettingRow>
        <SettingRow
          title="Cursor style"
          description="Shape of the cursor when the terminal is focused and unfocused."
        >
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground">Active</span>
              <Select
                value={terminalCursorStyle}
                onValueChange={(v) =>
                  void setTerminalCursorStyle(v as CursorStyle)
                }
              >
                <SelectTrigger size="sm" className="h-8 w-28 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURSOR_STYLES.map((style) => (
                    <SelectItem
                      key={style}
                      value={style}
                      className="text-[12px] [&>span:last-child]:w-full"
                    >
                      <span className="capitalize">{style}</span>
                      <CursorGlyph kind={style} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground">
                Inactive
              </span>
              <Select
                value={terminalCursorInactiveStyle}
                onValueChange={(v) =>
                  void setTerminalCursorInactiveStyle(
                    v as CursorInactiveStyle,
                  )
                }
              >
                <SelectTrigger size="sm" className="h-8 w-28 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURSOR_INACTIVE_STYLES.map((style) => (
                    <SelectItem
                      key={style}
                      value={style}
                      className="text-[12px] [&>span:last-child]:w-full"
                    >
                      <span className="capitalize">{style}</span>
                      <CursorGlyph kind={style} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SettingRow>
        {terminalCursorStyle === "bar" && (
          <SettingRow
            title="Cursor width"
            description="Thickness of the bar cursor, in pixels."
          >
            <Select
              value={String(terminalCursorWidth)}
              onValueChange={(v) => void setTerminalCursorWidth(Number(v))}
            >
              <SelectTrigger size="sm" className="h-8 w-36 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(
                  { length: CURSOR_WIDTH_MAX - CURSOR_WIDTH_MIN + 1 },
                  (_, i) => CURSOR_WIDTH_MIN + i,
                ).map((px) => (
                  <SelectItem
                    key={px}
                    value={String(px)}
                    className="text-[12px]"
                  >
                    {px} px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        )}
        <SliderRow
          title="Scroll sensitivity"
          description="Multiplier for mouse-wheel and trackpad scrolling. Higher scrolls more per gesture."
          value={terminalScrollSensitivity}
          min={SCROLL_SENSITIVITY_MIN}
          max={SCROLL_SENSITIVITY_MAX}
          step={SCROLL_SENSITIVITY_STEP}
          defaultValue={SCROLL_SENSITIVITY_DEFAULT}
          format={(v) => `${v}×`}
          onChange={(v) => void setTerminalScrollSensitivity(v)}
        />
        <SettingRow
          title="Scrollback"
          description="Lines of history kept per terminal. Higher uses more RAM (~3 KB / line)."
        >
          <Select
            value={String(terminalScrollback)}
            onValueChange={(v) => void setTerminalScrollback(Number(v))}
          >
            <SelectTrigger size="sm" className="h-8 w-36 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_SCROLLBACK_PRESETS.map((lines) => (
                <SelectItem
                  key={lines}
                  value={String(lines)}
                  className="text-[12px]"
                >
                  {lines.toLocaleString()} lines
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          title="Warn when closing a tab with a running process"
          description="Confirm before closing a terminal that still has a process running."
        >
          <Switch
            checked={warnOnCloseRunning}
            onCheckedChange={(v) =>
              void setWarnOnCloseTabWithRunningProcess(v)
            }
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Agents</Label>
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
        <Label>Startup</Label>
        <div className="flex flex-col gap-2">
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
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}



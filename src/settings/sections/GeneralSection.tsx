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
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  EDITOR_INDENT_SIZES,
  TERMINAL_SCROLLBACK_PRESETS,
  setAgentNotifications,
  setAutofocusNewTabs,
  setAutostart,
  setEditorAutoSave,
  setEditorAutocompletion,
  setEditorBracketMatching,
  setEditorCloseBrackets,
  setEditorCursorBlink,
  setEditorCursorStyle,
  setEditorHighlightActiveLine,
  setEditorIndentSize,
  setEditorIndentWithTabs,
  setEditorPreviewOnClick,
  setEditorScrollPastEnd,
  setTerminalCursorBlink,
  setTerminalCursorStyle,
  setTerminalScrollback,
  setTerminalWebglEnabled,
  setWarnOnCloseTabWithRunningProcess,
  type CursorStyle,
} from "@/modules/settings/store";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

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
  const warnOnCloseRunning = usePreferencesStore(
    (s) => s.warnOnCloseTabWithRunningProcess,
  );
  const agentNotifications = usePreferencesStore((s) => s.agentNotifications);
  const editorIndentSize = usePreferencesStore((s) => s.editorIndentSize);
  const editorIndentWithTabs = usePreferencesStore((s) => s.editorIndentWithTabs);
  const editorScrollPastEnd = usePreferencesStore((s) => s.editorScrollPastEnd);
  const editorHighlightActiveLine = usePreferencesStore((s) => s.editorHighlightActiveLine);
  const editorBracketMatching = usePreferencesStore((s) => s.editorBracketMatching);
  const editorCloseBrackets = usePreferencesStore((s) => s.editorCloseBrackets);
  const editorAutocompletion = usePreferencesStore((s) => s.editorAutocompletion);
  const editorCursorBlink = usePreferencesStore((s) => s.editorCursorBlink);
  const editorCursorStyle = usePreferencesStore((s) => s.editorCursorStyle);
  const terminalCursorStyle = usePreferencesStore((s) => s.terminalCursorStyle);
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
        <SettingRow title="Indentation size" description="Spaces per indent level (also the tab width).">
          <Select value={String(editorIndentSize)} onValueChange={(v) => void setEditorIndentSize(Number(v))}>
            <SelectTrigger size="sm" className="h-8 w-24 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EDITOR_INDENT_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-[12px]">{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow title="Indent with tabs" description="Insert tab characters instead of spaces.">
          <Switch checked={editorIndentWithTabs} onCheckedChange={(v) => void setEditorIndentWithTabs(v)} />
        </SettingRow>
        <SettingRow title="Scroll past end" description="Allow scrolling beyond the last line.">
          <Switch checked={editorScrollPastEnd} onCheckedChange={(v) => void setEditorScrollPastEnd(v)} />
        </SettingRow>
        <SettingRow title="Highlight active line" description="Highlight the line the cursor is on.">
          <Switch checked={editorHighlightActiveLine} onCheckedChange={(v) => void setEditorHighlightActiveLine(v)} />
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
        <SettingRow title="Cursor style" description="Editor caret shape.">
          <Select value={editorCursorStyle} onValueChange={(v) => void setEditorCursorStyle(v as CursorStyle)}>
            <SelectTrigger size="sm" className="h-8 w-28 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bar" className="text-[12px]">Bar</SelectItem>
              <SelectItem value="block" className="text-[12px]">Block</SelectItem>
              <SelectItem value="underline" className="text-[12px]">Underline</SelectItem>
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
        <SettingRow title="Cursor style" description="Terminal caret shape.">
          <Select value={terminalCursorStyle} onValueChange={(v) => void setTerminalCursorStyle(v as CursorStyle)}>
            <SelectTrigger size="sm" className="h-8 w-28 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bar" className="text-[12px]">Bar</SelectItem>
              <SelectItem value="block" className="text-[12px]">Block</SelectItem>
              <SelectItem value="underline" className="text-[12px]">Underline</SelectItem>
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



import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { Folder01Icon, Home01Icon, PinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { defaultMonoFontFamily } from "@/lib/fonts";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  type CursorInactiveStyle,
  type CursorStyle,
  type TerminalNewFolderMode,
  CURSOR_INACTIVE_STYLES,
  CURSOR_STYLES,
  CURSOR_WIDTH_MAX,
  CURSOR_WIDTH_MIN,
  FONT_SIZE_STEP,
  LETTER_SPACING_DEFAULT,
  LETTER_SPACING_MAX,
  LETTER_SPACING_MIN,
  LETTER_SPACING_STEP,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_STEP,
  SCROLL_SENSITIVITY_DEFAULT,
  SCROLL_SENSITIVITY_MAX,
  SCROLL_SENSITIVITY_MIN,
  SCROLL_SENSITIVITY_STEP,
  TERMINAL_FONT_SIZE_DEFAULT,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_LINE_HEIGHT_DEFAULT,
  TERMINAL_SCROLLBACK_PRESETS,
  setTerminalCursorBlink,
  setTerminalCursorInactiveStyle,
  setTerminalCursorStyle,
  setTerminalCursorWidth,
  setTerminalFontFamily,
  setTerminalFontSize,
  setTerminalFontWeight,
  setTerminalLetterSpacing,
  setTerminalLineHeight,
  setTerminalNewFolderMode,
  setTerminalScrollSensitivity,
  setTerminalScrollback,
  setTerminalShell,
  setTerminalWebglEnabled,
  setWarnOnCloseTabWithRunningProcess,
} from "@/modules/settings/store";
import { useEffect, useState } from "react";
import { CursorGlyph } from "../components/CursorGlyph";
import { FieldLabel } from "../components/FieldLabel";
import { FontFamilyInput } from "../components/FontFamilyInput";
import {
  formatPx,
  formatRatio,
  formatSignedPx,
} from "../components/formatters";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";
import { SliderRow } from "../components/SliderRow";

const TERMINAL_FONT_WEIGHTS = [
  { value: "normal", label: "Normal" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semi-Bold" },
  { value: "bold", label: "Bold" },
] as const;

type ShellInfo = { name: string; path: string; integrated: boolean };
const SHELL_AUTO = "auto";

export function TerminalSection() {
  const terminalFontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const terminalFontSize = usePreferencesStore((s) => s.terminalFontSize);
  const terminalFontWeight = usePreferencesStore((s) => s.terminalFontWeight);
  const terminalLetterSpacing = usePreferencesStore(
    (s) => s.terminalLetterSpacing,
  );
  const terminalLineHeight = usePreferencesStore((s) => s.terminalLineHeight);
  const terminalWebglEnabled = usePreferencesStore(
    (s) => s.terminalWebglEnabled,
  );
  const terminalCursorBlink = usePreferencesStore((s) => s.terminalCursorBlink);
  const terminalCursorStyle = usePreferencesStore((s) => s.terminalCursorStyle);
  const terminalCursorInactiveStyle = usePreferencesStore(
    (s) => s.terminalCursorInactiveStyle,
  );
  const terminalCursorWidth = usePreferencesStore((s) => s.terminalCursorWidth);
  const terminalScrollSensitivity = usePreferencesStore(
    (s) => s.terminalScrollSensitivity,
  );
  const terminalScrollback = usePreferencesStore((s) => s.terminalScrollback);
  const warnOnCloseRunning = usePreferencesStore(
    (s) => s.warnOnCloseTabWithRunningProcess,
  );
  const terminalShell = usePreferencesStore((s) => s.terminalShell);
  const terminalNewFolderMode = usePreferencesStore(
    (s) => s.terminalNewFolderMode,
  );
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [home, setHome] = useState<string>("");

  useEffect(() => {
    void invoke<ShellInfo[]>("pty_list_shells")
      .then(setShells)
      .catch(() => {});
    void homeDir()
      .then((h) => setHome(h.replace(/\\/g, "/").replace(/\/$/, "")))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Terminal" />

      <SettingRow
        title="Default shell"
        description={
          shells.find((s) => s.path === terminalShell)?.integrated === false
            ? "Command blocks and directory tracking are unavailable for this shell."
            : "Shell for new terminal tabs. Existing tabs keep their shell."
        }
      >
        <Select
          value={terminalShell || SHELL_AUTO}
          onValueChange={(v) => void setTerminalShell(v === SHELL_AUTO ? "" : v)}
        >
          <SelectTrigger size="sm" className="h-8 w-40 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SHELL_AUTO} className="text-[12px]">Auto</SelectItem>
            {shells.map((s) => (
              <SelectItem key={s.path} value={s.path} className="text-[12px]">
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        title="Open new terminals in"
        description="Where new terminal tabs and splits open."
      >
        <Select
          value={terminalNewFolderMode}
          onValueChange={(v) =>
            void setTerminalNewFolderMode(v as TerminalNewFolderMode)
          }
        >
          <SelectTrigger size="sm" className="h-8 w-60 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="home" className="text-[12px]">
              <span className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={Home01Icon}
                  size={13}
                  strokeWidth={2}
                  className="text-muted-foreground"
                />
                {home || "Home"}
              </span>
            </SelectItem>
            <SelectItem value="workspace" className="text-[12px]">
              <span className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={PinIcon}
                  size={13}
                  strokeWidth={2}
                  className="text-muted-foreground"
                />
                Workspace root folder
              </span>
            </SelectItem>
            <SelectItem value="context" className="text-[12px]">
              <span className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={Folder01Icon}
                  size={13}
                  strokeWidth={2}
                  className="text-muted-foreground"
                />
                Last folder from terminal or editor
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <div className="flex flex-col gap-2">
        <FieldLabel>Font</FieldLabel>
        <FontFamilyInput
          value={terminalFontFamily}
          defaultFamily={defaultMonoFontFamily()}
          onChange={(v) => void setTerminalFontFamily(v)}
        />
        <SliderRow
          title="Font size"
          description="Terminal text size."
          value={terminalFontSize}
          min={TERMINAL_FONT_SIZE_MIN}
          max={TERMINAL_FONT_SIZE_MAX}
          step={FONT_SIZE_STEP}
          defaultValue={TERMINAL_FONT_SIZE_DEFAULT}
          format={formatPx}
          onChange={(v) => void setTerminalFontSize(v)}
        />
        <SettingRow
          title="Font weight"
          description="Thickness of terminal characters"
        >
          <Select
            value={terminalFontWeight}
            onValueChange={(v) => void setTerminalFontWeight(v)}
          >
            <SelectTrigger size="sm" className="h-8 w-28 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_FONT_WEIGHTS.map((w) => (
                <SelectItem key={w.value} value={w.value} className="text-[12px]">
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SliderRow
          title="Letter spacing"
          description="Extra horizontal space between characters."
          value={terminalLetterSpacing}
          min={LETTER_SPACING_MIN}
          max={LETTER_SPACING_MAX}
          step={LETTER_SPACING_STEP}
          defaultValue={LETTER_SPACING_DEFAULT}
          format={formatSignedPx}
          onChange={(v) => void setTerminalLetterSpacing(v)}
        />
        <SliderRow
          title="Line height"
          description="Vertical space per row, as a multiple of the font size."
          value={terminalLineHeight}
          min={LINE_HEIGHT_MIN}
          max={LINE_HEIGHT_MAX}
          step={LINE_HEIGHT_STEP}
          defaultValue={TERMINAL_LINE_HEIGHT_DEFAULT}
          format={formatRatio}
          onChange={(v) => void setTerminalLineHeight(v)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Rendering</FieldLabel>
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
                  <TooltipContent side="top" className="max-w-65 text-[11px]">
                    xterm's WebGL renderer caches glyphs in a GPU texture atlas.
                    On some macOS setups (especially with Nerd Fonts), the atlas
                    corrupts and terminal text becomes unreadable. Turn this off
                    as a fallback — performance dips slightly, but text renders
                    correctly via the DOM renderer.
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
            onCheckedChange={(v) => void setWarnOnCloseTabWithRunningProcess(v)}
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Cursor</FieldLabel>
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
                  void setTerminalCursorInactiveStyle(v as CursorInactiveStyle)
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
        <SettingRow
          title="Cursor blinking"
          description="Blink the terminal cursor. Off by default for lower idle CPU, matching VS Code and the macOS terminal."
        >
          <Switch
            checked={terminalCursorBlink}
            onCheckedChange={(v) => void setTerminalCursorBlink(v)}
          />
        </SettingRow>
      </div>
    </div>
  );
}

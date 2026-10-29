import { invoke } from "@tauri-apps/api/core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { defaultMonoFontFamily, resolveMonoFontFamily } from "@/lib/fonts";
import { uiFontLabel } from "@/lib/uiFonts";
import { Kbd } from "@/components/ui/kbd";
import {
  openSettingsWindow,
  openShortcutsSettings,
} from "@/modules/settings/openSettingsWindow";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import { ENTER_KEY, fmtShortcut, SHIFT_KEY } from "@/lib/platform";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  BACKGROUND_MEMORY_REFERENCE_COLS,
  estimateParkedTerminalBudget,
  estimateTerminalBytes,
} from "@/modules/terminal/lib/backgroundMemoryBudget";
import {
  autoHibernateModes,
  AUTO_HIBERNATE_LABELS,
  type AutoHibernate,
} from "@/modules/workspaces/lib/autoHibernate";
import {
  type CursorInactiveStyle,
  type CursorStyle,
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
  TERMINAL_BACKGROUND_MEMORY_BUDGET_PRESETS_MB,
  TERMINAL_FONT_SIZE_DEFAULT,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_LINE_HEIGHT_DEFAULT,
  TERMINAL_SCROLLBACK_PRESETS,
  setAutoHibernate,
  setHibernateSaveLines,
  setTerminalBackgroundMemoryBudget,
  setTerminalCursorBlink,
  setTerminalCursorInactiveStyle,
  setTerminalCursorStyle,
  setTerminalCursorWidth,
  setTerminalFontFamily,
  setTerminalFontSize,
  setTerminalFontWeight,
  setTerminalLetterSpacing,
  setTerminalLineHeight,
  setTerminalScratchpadEnterSends,
  setTerminalScratchpadMonospace,
  setTerminalScrollSensitivity,
  setTerminalScrollback,
  setTerminalShell,
  setTerminalWebglEnabled,
} from "@/modules/settings/store";
import { useEffect, useState } from "react";
import { CursorGlyph } from "../components/CursorGlyph";
import { FieldLabel } from "../components/FieldLabel";
import { sendPlaceholder } from "@/modules/terminal/lib/scratchpadHints";
import { SegmentedControl } from "../components/SegmentedControl";
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
  const autoHibernate = usePreferencesStore((s) => s.autoHibernate);
  const hibernateSaveLines = usePreferencesStore((s) => s.hibernateSaveLines);
  const hibernateModes = autoHibernateModes(import.meta.env.DEV);
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
  const terminalBackgroundMemoryBudgetMB = usePreferencesStore(
    (s) => s.terminalBackgroundMemoryBudgetMB,
  );
  const uiFont = usePreferencesStore((s) => s.uiFont);
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const scratchpadShortcut = getShortcutLabel(
    "terminal.scratchpad",
    userShortcuts,
  );
  const scratchpadMonoFamily = resolveMonoFontFamily(terminalFontFamily);
  const scratchpadMonospace = usePreferencesStore(
    (s) => s.scratchpadMonospace,
  );
  const scratchpadEnterSends = usePreferencesStore(
    (s) => s.scratchpadEnterSends,
  );
  const terminalShell = usePreferencesStore((s) => s.terminalShell);
  const [shells, setShells] = useState<ShellInfo[]>([]);

  useEffect(() => {
    void invoke<ShellInfo[]>("pty_list_shells")
      .then(setShells)
      .catch(() => {});
  }, []);

  // Shared with the Scrollback row below so the two RAM estimates on this
  // screen can never drift apart: both are the exact xterm.js buffer cost
  // (cols * 3 cells * 4 bytes), at the same reference width.
  const bytesPerLineAtReference = estimateTerminalBytes(1);
  const parkedTerminalBudget = estimateParkedTerminalBudget(
    terminalBackgroundMemoryBudgetMB * 1024 * 1024,
    terminalScrollback,
  );
  const backgroundMemoryHeadline =
    terminalBackgroundMemoryBudgetMB === 0
      ? "0 MB releases background terminals immediately, rebuilding them from scratch each time you switch back."
      : `Keeps roughly ${parkedTerminalBudget.toLocaleString()} background terminal${
          parkedTerminalBudget === 1 ? "" : "s"
        } alive instead of rebuilding ${
          parkedTerminalBudget === 1 ? "it" : "them"
        } on your next visit. Estimated at the current scrollback and ${BACKGROUND_MEMORY_REFERENCE_COLS} columns wide.`;
  const backgroundMemoryDescription = `${backgroundMemoryHeadline} Terminals running a full-screen app (vim, htop...) while hidden always stay alive, regardless of this setting.`;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Terminal" />

      <SettingRow
        title="Default shell"
        description={
          shells.find((s) => s.path === terminalShell)?.integrated === false
            ? "Command blocks and folder tracking are unavailable for this shell."
            : "Shell for new terminal tabs."
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

      <div className="flex flex-col gap-2">
        <FieldLabel>Scratchpad</FieldLabel>
        <div className="overflow-hidden rounded-lg border border-border/60 bg-card/60">
          <div className="grid grid-cols-1 divide-border/60 sm:grid-cols-2 sm:divide-x">
            <div className="flex flex-col gap-2.5 px-3 py-2.5">
              <span className="text-[12.5px] font-medium">Font</span>
              <SegmentedControl
                label="Scratchpad font"
                value={scratchpadMonospace ? "mono" : "ui"}
                onChange={(v) =>
                  void setTerminalScratchpadMonospace(v === "mono")
                }
                options={[
                  { value: "ui", label: uiFontLabel(uiFont) },
                  {
                    value: "mono",
                    label: "Monospace",
                    style: { fontFamily: scratchpadMonoFamily },
                  },
                ]}
              />
              <span className="min-h-[15px] text-[10.5px] text-muted-foreground">
                {scratchpadMonospace ? (
                  "Same as the terminal."
                ) : (
                  <>
                    UI font.{" "}
                    <button
                      type="button"
                      onClick={() => void openSettingsWindow("appearance")}
                      className="underline underline-offset-2 transition-colors hover:text-foreground"
                    >
                      Change font
                    </button>
                  </>
                )}
              </span>
            </div>
            <div className="flex flex-col gap-2.5 px-3 py-2.5">
              <span className="text-[12.5px] font-medium">Send style</span>
              <SegmentedControl
                label="Scratchpad send key"
                value={scratchpadEnterSends ? "enter" : "shift-enter"}
                onChange={(v) =>
                  void setTerminalScratchpadEnterSends(v === "enter")
                }
                options={[
                  {
                    value: "enter",
                    label: "Terminal",
                    sublabel: `${ENTER_KEY} sends`,
                  },
                  {
                    value: "shift-enter",
                    label: "Text field",
                    sublabel: `${fmtShortcut(SHIFT_KEY, ENTER_KEY)} sends`,
                  },
                ]}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 border-t border-border/60 bg-muted/30 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Preview
              </span>
              <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                {scratchpadShortcut ? (
                  <>
                    <Kbd>{scratchpadShortcut}</Kbd>
                    toggles the scratchpad.
                  </>
                ) : (
                  "No shortcut set."
                )}
                <button
                  type="button"
                  onClick={() => void openShortcutsSettings("Scratchpad")}
                  className="underline underline-offset-2 transition-colors hover:text-foreground"
                >
                  {scratchpadShortcut ? "Change shortcut" : "Set shortcut"}
                </button>
              </span>
            </div>
            <div
              className="rounded-xl bg-background px-4 py-3 text-sm leading-[1.4] text-muted-foreground/70 shadow-[0_0_14px_3px_var(--tw-shadow-color)] shadow-primary/40 ring-1 ring-inset ring-primary/50"
              style={{
                fontFamily: scratchpadMonospace
                  ? scratchpadMonoFamily
                  : "inherit",
              }}
            >
              {sendPlaceholder(scratchpadEnterSends)}
            </div>
          </div>
        </div>
      </div>

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
                    as a fallback - performance dips slightly, but text renders
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
          description={`Lines of history kept per terminal. Higher uses more RAM (~${(
            bytesPerLineAtReference / 1024
          ).toFixed(1)} KB / line at ${BACKGROUND_MEMORY_REFERENCE_COLS} columns; wider terminals cost more per line).`}
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
          title="Background terminal memory budget"
          description={backgroundMemoryDescription}
        >
          <Select
            value={String(terminalBackgroundMemoryBudgetMB)}
            onValueChange={(v) => void setTerminalBackgroundMemoryBudget(Number(v))}
          >
            <SelectTrigger size="sm" className="h-8 w-36 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_BACKGROUND_MEMORY_BUDGET_PRESETS_MB.map((mb) => (
                <SelectItem key={mb} value={String(mb)} className="text-[12px]">
                  {mb === 0 ? "Off" : `${mb} MB`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <SettingRow
          title="Auto-hibernate"
          description="Hibernate a terminal tab after it has been out of sight for this long. It frees the terminal and its process, and a tab that held an agent resumes it when restored. A working agent is never hibernated."
        >
          <RadioGroup
            value={autoHibernate}
            onValueChange={(v) => void setAutoHibernate(v as AutoHibernate)}
          >
            {hibernateModes.map((mode) => (
              <div key={mode} className="flex items-center gap-2">
                <RadioGroupItem value={mode} id={`auto-hibernate-${mode}`} />
                <label htmlFor={`auto-hibernate-${mode}`} className="cursor-pointer text-[12px]">
                  {AUTO_HIBERNATE_LABELS[mode]}
                </label>
              </div>
            ))}
          </RadioGroup>
        </SettingRow>
        <SettingRow
          title="Keep the last lines of a hibernated tab"
          description="Store the last lines of the terminal, with their colors, when a tab hibernates and show them dimmed behind the Restore screen. Obvious tokens are crossed out, but the lines are kept unencrypted on this machine, so turn it off if your terminals show sensitive output."
        >
          <Switch
            checked={hibernateSaveLines}
            onCheckedChange={(v) => void setHibernateSaveLines(v)}
          />
        </SettingRow>
      </div>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setNoteTint } from "@/modules/settings/store";
import { useTheme } from "@/modules/theme";
import { defaultNoteTint, noteSurface, noteTintKey, type NoteTint } from "@/modules/theme/noteSurface";
import { INPUT_CLASS } from "./inputClass";

const FALLBACK: NoteTint = { color: "#facc15", amount: 0.2 };

// TEMPORARY: lets the yellow of the floating notes be tuned per theme and mode.
// Values land in settings-general.json under "noteTint"; once they are baked
// into the themes this component and the preference go away.
export function NoteTintTuner() {
  const { resolvedTheme, resolvedMode } = useTheme();
  const saved = usePreferencesStore((s) => s.noteTint);
  const variant = resolvedTheme.variants[resolvedMode] ?? resolvedTheme.variants.dark ?? resolvedTheme.variants.light;
  const bg = variant?.editor?.background ?? variant?.colors?.background ?? "";
  const fg = variant?.editor?.foreground ?? variant?.colors?.foreground;
  const key = noteTintKey(resolvedTheme.id, resolvedMode);
  const base = defaultNoteTint(bg, !!variant?.noteStrong) ?? FALLBACK;
  const current = saved[key] ?? base;
  const preview = noteSurface(bg, fg, false, current);

  const commit = (next: NoteTint) => void setNoteTint({ ...saved, [key]: next });
  const reset = () => {
    const rest = { ...saved };
    delete rest[key];
    void setNoteTint(rest);
  };
  const percent = Math.round(current.amount * 100);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium">
          Note yellow: {resolvedTheme.name} ({resolvedMode})
        </span>
        <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" disabled={!saved[key]} onClick={reset}>
          Reset
        </Button>
      </div>

      <div
        className="rounded-md border border-border/60 px-3 py-2 text-[12.5px]"
        style={preview ? { background: preview.background, color: preview.foreground } : undefined}
      >
        Sticky note sample text
      </div>

      <div className="flex items-center gap-2">
        <span className="w-14 text-[11.5px] text-muted-foreground">Color</span>
        <input
          type="color"
          value={current.color}
          onChange={(e) => commit({ ...current, color: e.target.value })}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
        />
        <input
          type="text"
          defaultValue={current.color}
          key={current.color}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{6}$/.test(v)) commit({ ...current, color: v.toLowerCase() });
          }}
          className={`${INPUT_CLASS} max-w-28 font-mono`}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="w-14 text-[11.5px] text-muted-foreground">Amount</span>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[percent]}
          onValueChange={([v]) => commit({ ...current, amount: (v ?? 0) / 100 })}
          className="flex-1"
        />
        <input
          type="number"
          min={0}
          max={100}
          value={percent}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) commit({ ...current, amount: Math.min(100, Math.max(0, n)) / 100 });
          }}
          className={`${INPUT_CLASS} max-w-16`}
        />
        <span className="text-[11.5px] text-muted-foreground">%</span>
      </div>
    </div>
  );
}

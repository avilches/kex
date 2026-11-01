import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setExplorerGitColorScheme, setPreviewOnClick } from "@/modules/settings/store";
import { STYLE_PRESETS } from "../lib/onboardingState";
import { type StyleChoice, styleOf } from "../lib/onboardingSummary";

const CHOICES: { value: StyleChoice; title: string; text: string }[] = [
  {
    value: "vscode",
    title: "VS Code",
    text: "A single click opens a file in a preview tab. Git changes use VS Code colors.",
  },
  {
    value: "jetbrains",
    title: "JetBrains",
    text: "A single click selects, a double click opens. Git changes use JetBrains colors.",
  },
];

function apply(choice: StyleChoice): void {
  const preset = STYLE_PRESETS[choice];
  Promise.all([
    setExplorerGitColorScheme(preset.explorerGitColorScheme),
    setPreviewOnClick(preset.previewOnClick),
  ]).catch((e) => console.error("[kex] applying the style preset failed:", e));
}

export function StyleStep() {
  const scheme = usePreferencesStore((s) => s.explorerGitColorScheme);
  const previewOnClick = usePreferencesStore((s) => s.previewOnClick);
  const current = styleOf(scheme, previewOnClick);

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        className="grid-cols-2 gap-3"
        value={current ?? ""}
        onValueChange={(v) => apply(v as StyleChoice)}
      >
        {CHOICES.map((choice) => {
          const id = `onboarding-style-${choice.value}`;
          return (
            <label
              key={choice.value}
              htmlFor={id}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-colors",
                current === choice.value
                  ? "border-primary/70 bg-primary/10"
                  : "border-border/60 bg-card/60 hover:border-border",
              )}
            >
              <span className="flex items-center gap-2">
                <RadioGroupItem value={choice.value} id={id} />
                <span className="text-[13px] font-medium">{choice.title}</span>
              </span>
              <span className="text-[12px] leading-relaxed text-muted-foreground">{choice.text}</span>
            </label>
          );
        })}
      </RadioGroup>
      <p className="text-[12px] text-muted-foreground">
        {current === null
          ? "You already have your own mix. Pick one to replace it, or skip to keep it."
          : "You can fine-tune both later in Settings."}
      </p>
    </div>
  );
}

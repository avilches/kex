export const UI_FONT_PRESETS: { label: string; value: string }[] = [
  { label: "Default (Inter)", value: "" },
  { label: "Geist Variable", value: "Geist Variable" },
  { label: "DM Sans", value: "DM Sans Variable" },
  { label: "System UI", value: "system-ui" },
  { label: "SF Pro (macOS)", value: "-apple-system, BlinkMacSystemFont" },
  { label: "Helvetica Neue", value: "Helvetica Neue, Helvetica, Arial" },
  { label: "Georgia (serif)", value: "Georgia, serif" },
  { label: "Trebuchet MS", value: "Trebuchet MS, sans-serif" },
  { label: "Custom...", value: "__custom__" },
];

// Short name of the UI font preference, for places that show which font is in use.
export function uiFontLabel(uiFont: string): string {
  if (uiFont === "") return "Inter";
  const preset = UI_FONT_PRESETS.find(
    (p) => p.value === uiFont && p.value !== "__custom__",
  );
  if (preset) return preset.label.replace(/ \(.*\)$/, "");
  const first = uiFont.split(",")[0]?.trim().replace(/^["']+|["']+$/g, "");
  return first || "Inter";
}

// Shared Tailwind classes for native <input>/<select> elements in Settings
// screens. See docs/SETTINGS_UI.md "Estilo de inputs en Settings" for why this differs
// from the app's general input styling (focus:outline-none + focus:ring-1
// instead of focus-visible:ring-1, bg-transparent instead of bg-background).
export const INPUT_CLASS =
  "h-8 w-full rounded border border-border bg-transparent px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

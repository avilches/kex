import type { Theme } from "../types";

export const teraxDefault: Theme = {
  id: "terax-default",
  name: "Terax Default",
  description: "The default Terax look - clean glass over neutral surfaces.",
  editorTheme: { dark: "atomone", light: "atomone" },
  inactivePaneDim: { terminal: 0.12 },
  variants: {
    light: { colors: { tabFocusIndicator: "oklch(0.578 0.199 264.4)" } },
    dark:  { colors: { tabFocusIndicator: "oklch(0.578 0.199 264.4)" } },
  },
};

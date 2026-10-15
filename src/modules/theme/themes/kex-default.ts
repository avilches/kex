import type { Theme } from "../types";

export const kexDefault: Theme = {
  id: "kex-default",
  name: "Kex Default",
  description: "The default Kex look - clean glass over neutral surfaces.",
  editorTheme: { dark: "atomone", light: "github-light" },
  variants: {
    light: {
      colors: {
        background: "#FFFFFF",
        muted: "#F1F3F3",
        mutedForeground: "#67787C",
        primary: "#3C6FED",
        primaryForeground: "#F9FBFB",
        sidebar: "#FCFCFC",
        border: "#E9EAEE",
        input: "#E9EAEE",
        sidebarBorder: "#E9EAEE",
      },
      terminal: {
        background: "#FFFFFF",
        foreground: "#0A0A0A",
        cursor: "#0A0A0A",
        cursorAccent: "#FFFFFF",
        selection: "rgba(60,111,237,0.25)",
        ansi: [
          "#18181B", "#DC2626", "#16A34A", "#A16207",
          "#2563EB", "#9333EA", "#0E7490", "#71717A",
          "#52525B", "#EF4444", "#15803D", "#CA8A04",
          "#1D4ED8", "#7E22CE", "#0891B2", "#A1A1AA",
        ],
      },
      inactivePaneDim: { terminal: 0.015 },
    },
    dark: {
      noteTint: { color: "#006d8f", amount: 0.5 },
      colors: {
        background: "#2B2B2B",
        card: "#363636",
        popover: "#363636",
        sidebar: "#2D2D2D",
        secondary: "#484848",
        muted: "#484848",
        mutedForeground: "#9CA8AB",
        primary: "#3C6FED",
        primaryForeground: "#F9FBFB",
        accent: "#484848",
        sidebarAccent: "#484848",
      },
      terminal: {
        background: "#2B2B2B",
        foreground: "#FAFAFA",
        cursor: "#FAFAFA",
        cursorAccent: "#2B2B2B",
        selection: "rgba(64,140,255,0.35)",
        ansi: [
          "#18181B", "#EF4444", "#22C55E", "#EAB308",
          "#3B82F6", "#A855F7", "#06B6D4", "#E4E4E7",
          "#52525B", "#F87171", "#4ADE80", "#FACC15",
          "#60A5FA", "#C084FC", "#22D3EE", "#FAFAFA",
        ],
      },
      inactivePaneDim: { terminal: 0.12, editor: 0.12 },
    },
  },
};

import type { Theme } from "../types";

export const kexDefault: Theme = {
  id: "kex-default",
  name: "Kex Default",
  description: "The default Kex look - clean glass over neutral surfaces.",
  editorTheme: { dark: "atomone", light: "atomone" },
  variants: {
    light: {
      colors: {
        sidebar: "#FCFCFC",
        border: "#E9EAEE",
        input: "#E9EAEE",
        sidebarBorder: "#E9EAEE",
      },
      inactivePaneDim: { terminal: 0.015 },
    },
    dark: {
      colors: {
        background: "#2B2B2B",
        card: "#363636",
        popover: "#363636",
        sidebar: "#2D2D2D",
      },
      terminal: {
        background: "#2B2B2B",
      },
      inactivePaneDim: { terminal: 0.12, editor: 0.12 },
    },
  },
};

import type { Theme } from "../types";

export const kexDefault: Theme = {
  id: "kex-default",
  name: "Kex Default",
  description: "The default Kex look - clean glass over neutral surfaces.",
  editorTheme: { dark: "atomone", light: "atomone" },
  variants: {
    light: { inactivePaneDim: { terminal: 0.015 } },
    dark:  { inactivePaneDim: { terminal: 0.12 } },
  },
};

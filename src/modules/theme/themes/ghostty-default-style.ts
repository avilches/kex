import type { Theme } from "../types";

// Terminal palette only: no app colors and no editor pairing, so it is not an
// app theme. Dark is Ghostty's "Default Style Dark" as shipped; its selection
// (#ffffff with #282c34 text) is a translucent white here because a palette has
// no selection text color. Light is ours, built from the dark one: same hues,
// darkened until each color reaches 4.5:1 on the background.
export const ghosttyDefaultStyle: Theme = {
  id: "ghostty-default-style",
  name: "Ghostty Default Style",
  description: "The terminal palette of Ghostty's Default Style Dark, with a light variant derived from it.",
  variants: {
    dark: {
      terminal: {
        background: "#282c34",
        foreground: "#ffffff",
        cursor: "#ffffff",
        cursorAccent: "#353a44",
        selection: "rgba(255,255,255,0.3)",
        ansi: [
          "#1d1f21", "#cc6566", "#b6bd68", "#f0c674",
          "#82a2be", "#b294bb", "#8abeb7", "#c4c8c6",
          "#666666", "#d54e53", "#b9ca4b", "#e7c547",
          "#7aa6da", "#c397d8", "#70c0b1", "#eaeaea",
        ],
      },
    },
    light: {
      terminal: {
        background: "#f7f8fa",
        foreground: "#282c34",
        cursor: "#282c34",
        cursorAccent: "#f7f8fa",
        selection: "rgba(40,44,52,0.18)",
        ansi: [
          "#1d1f21", "#af5758", "#717540", "#866f41",
          "#5e7589", "#806b87", "#577873", "#707271",
          "#666666", "#c4484c", "#6d772c", "#847028",
          "#557499", "#856793", "#487b71", "#707070",
        ],
      },
    },
  },
};

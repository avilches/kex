import { describe, expect, test } from "vitest";
import { validateTheme } from "./validateTheme";
import { kexDefault } from "./themes/kex-default";
import { nord } from "./themes/nord";
import { tokyoNight } from "./themes/tokyo-night";
import { catppuccin } from "./themes/catppuccin";

describe("validateTheme", () => {
  describe("valid themes", () => {
    test("accepts kex-default", () => {
      const result = validateTheme(kexDefault);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.theme.id).toBe("kex-default");
        expect(result.theme.name).toBe("Kex Default");
      }
    });

    test("accepts nord with hex colors", () => {
      const result = validateTheme(nord);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.theme.id).toBe("nord");
      }
    });

    test("accepts tokyo with hex colors", () => {
      const result = validateTheme(tokyoNight);
      expect(result.ok).toBe(true);
    });

    test("accepts catppuccin with hex colors", () => {
      const result = validateTheme(catppuccin);
      expect(result.ok).toBe(true);
    });

    test("accepts theme with named colors", () => {
      const theme = {
        id: "test-colors",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "black",
              foreground: "white",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(true);
    });

    test("accepts theme with rgba colors", () => {
      const theme = {
        id: "test-rgba",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "rgba(0,0,0,0.5)",
              foreground: "rgb(255,255,255)",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(true);
    });

    test("accepts theme with hsl colors", () => {
      const theme = {
        id: "test-hsl",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "hsl(0, 0%, 0%)",
              foreground: "hsla(0, 100%, 100%, 0.9)",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(true);
    });

    test("accepts theme with mix() colors", () => {
      const theme = {
        id: "test-mix",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "color-mix(in srgb, black 50%, white)",
              foreground: "white",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(true);
    });

    test("accepts terminal colors", () => {
      const theme = {
        id: "test-terminal",
        name: "Test",
        variants: {
          dark: {
            terminal: {
              background: "#000",
              foreground: "#fff",
              cursor: "red",
              cursorAccent: "yellow",
              selection: "rgba(100,100,100,0.3)",
              ansi: [
                "#000", "#f00", "#0f0", "#ff0",
                "#00f", "#f0f", "#0ff", "#fff",
                "#888", "#f88", "#8f8", "#ff8",
                "#88f", "#f8f", "#8ff", "#f0f",
              ],
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(true);
    });
  });

  describe("invalid colors in colors object", () => {
    test("rejects invalid hex color", () => {
      const theme = {
        id: "test-invalid",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "#gggggg",
              foreground: "white",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("background");
        expect(result.error).toContain("not a valid CSS color");
      }
    });

    test("rejects color with url()", () => {
      const theme = {
        id: "test-url",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "url(http://evil.com/data.json)",
              foreground: "white",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("background");
      }
    });

    test("rejects color with image-set()", () => {
      const theme = {
        id: "test-imageset",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "image-set(url('a.png') 1x, url('b.png') 2x)",
              foreground: "white",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("background");
      }
    });

    test("rejects color with semicolon", () => {
      const theme = {
        id: "test-semicolon",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "#000; color: red;",
              foreground: "white",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("background");
      }
    });

    test("rejects multiple invalid colors and reports first", () => {
      const theme = {
        id: "test-multi",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "url(evil)",
              foreground: "image-set(bad)",
              ring: "white",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
    });
  });

  describe("invalid colors in terminal palette", () => {
    test("rejects invalid background color in terminal", () => {
      const theme = {
        id: "test-term-bg",
        name: "Test",
        variants: {
          dark: {
            terminal: {
              background: "not-a-color",
              foreground: "white",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("terminal.background");
      }
    });

    test("rejects url() in terminal color", () => {
      const theme = {
        id: "test-term-url",
        name: "Test",
        variants: {
          dark: {
            terminal: {
              background: "black",
              foreground: "url(http://evil.com/logo)",
              cursor: "white",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("terminal.foreground");
      }
    });

    test("rejects image-set() in cursor color", () => {
      const theme = {
        id: "test-term-cursor",
        name: "Test",
        variants: {
          dark: {
            terminal: {
              background: "black",
              foreground: "white",
              cursor: "image-set(url('a') 1x)",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("terminal.cursor");
      }
    });

    test("rejects semicolon in selection color", () => {
      const theme = {
        id: "test-term-selection",
        name: "Test",
        variants: {
          dark: {
            terminal: {
              background: "black",
              foreground: "white",
              selection: "rgba(100,100,100,0.3); color: red;",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("terminal.selection");
      }
    });

    test("rejects invalid ansi color", () => {
      const theme = {
        id: "test-ansi",
        name: "Test",
        variants: {
          dark: {
            terminal: {
              background: "black",
              foreground: "white",
              ansi: [
                "#000", "#f00", "#0f0", "#ff0",
                "#00f", "#f0f", "#0ff", "#fff",
                "#888", "#f88", "#8f8", "#ff8",
                "#88f", "#f8f", "url(bad)", "#f0f",
              ],
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("ansi[14]");
      }
    });
  });

  describe("edge cases", () => {
    test("rejects empty color string", () => {
      const theme = {
        id: "test-empty",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "",
              foreground: "white",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("must be a non-empty string");
      }
    });

    test("accepts color with capital letters in hex", () => {
      const theme = {
        id: "test-caps",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "#FFFFFF",
              foreground: "#000000",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(true);
    });

    test("accepts color with short hex notation", () => {
      const theme = {
        id: "test-short-hex",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "#fff",
              foreground: "#000",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(true);
    });

    test("rejects malformed url with semicolon injection", () => {
      const theme = {
        id: "test-injection",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "#000; font-family: evil;",
              foreground: "white",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
    });
  });

  describe("other validation still works", () => {
    test("still rejects invalid id format", () => {
      const theme = {
        id: "INVALID",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "black",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("id");
      }
    });

    test("still rejects missing variants", () => {
      const theme = {
        id: "test-no-variants",
        name: "Test",
        variants: {},
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("variants");
      }
    });

    test("still rejects unrecognized color key", () => {
      const theme = {
        id: "test-bad-key",
        name: "Test",
        variants: {
          dark: {
            colors: {
              background: "black",
              unknownKey: "red",
            },
          },
        },
      };
      const result = validateTheme(theme);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("unknownKey");
        expect(result.error).toContain("not a recognized color key");
      }
    });
  });
});

export type EditorGroup = "VS Code" | "JetBrains" | "Text Editors" | "Terminals" | "Other IDEs";
export type EditorTargetType = "file" | "workspace";

export interface CatalogEntry {
  id: string;
  name: string;
  group: EditorGroup;
  /** Whether this editor opens individual files or a project directory. */
  type: EditorTargetType;
}

export const EDITOR_CATALOG: CatalogEntry[] = [
  // VS Code family
  { id: "vscode", name: "VS Code", group: "VS Code", type: "file" },
  { id: "vscode-insiders", name: "VS Code Insiders", group: "VS Code", type: "file" },
  { id: "vscodium", name: "VSCodium", group: "VS Code", type: "file" },
  { id: "cursor", name: "Cursor", group: "VS Code", type: "file" },
  { id: "windsurf", name: "Windsurf", group: "VS Code", type: "file" },
  { id: "kiro", name: "Kiro", group: "VS Code", type: "file" },
  { id: "trae", name: "Trae", group: "VS Code", type: "file" },
  { id: "trae-solo", name: "Trae Solo", group: "VS Code", type: "file" },
  { id: "antigravity", name: "Antigravity", group: "VS Code", type: "file" },
  // Text editors
  { id: "zed", name: "Zed", group: "Text Editors", type: "file" },
  { id: "zed-preview", name: "Zed Preview", group: "Text Editors", type: "file" },
  { id: "sublime-text", name: "Sublime Text", group: "Text Editors", type: "file" },
  { id: "atom", name: "Atom", group: "Text Editors", type: "file" },
  { id: "bbedit", name: "BBEdit", group: "Text Editors", type: "file" },
  { id: "cotedit", name: "CotEditor", group: "Text Editors", type: "file" },
  { id: "textmate", name: "TextMate", group: "Text Editors", type: "file" },
  { id: "coderunner", name: "CodeRunner", group: "Text Editors", type: "file" },
  // JetBrains (project/workspace-based)
  { id: "intellij", name: "IntelliJ IDEA", group: "JetBrains", type: "workspace" },
  { id: "pycharm", name: "PyCharm", group: "JetBrains", type: "workspace" },
  { id: "webstorm", name: "WebStorm", group: "JetBrains", type: "workspace" },
  { id: "goland", name: "GoLand", group: "JetBrains", type: "workspace" },
  { id: "rubymine", name: "RubyMine", group: "JetBrains", type: "workspace" },
  { id: "rustrover", name: "RustRover", group: "JetBrains", type: "workspace" },
  { id: "android-studio", name: "Android Studio", group: "JetBrains", type: "workspace" },
  { id: "rider", name: "Rider", group: "JetBrains", type: "workspace" },
  { id: "appcode", name: "AppCode", group: "JetBrains", type: "workspace" },
  { id: "clion", name: "CLion", group: "JetBrains", type: "workspace" },
  { id: "phpstorm", name: "PhpStorm", group: "JetBrains", type: "workspace" },
  { id: "mps", name: "MPS", group: "JetBrains", type: "workspace" },
  { id: "android-studio-canary", name: "Android Studio Canary", group: "JetBrains", type: "workspace" },
  // Terminals (open workspace/directory)
  { id: "terminal-app", name: "Terminal", group: "Terminals", type: "workspace" },
  { id: "wave", name: "Wave", group: "Terminals", type: "workspace" },
  { id: "warp", name: "Warp", group: "Terminals", type: "workspace" },
  { id: "ghostty", name: "Ghostty", group: "Terminals", type: "workspace" },
  { id: "iterm2", name: "iTerm2", group: "Terminals", type: "workspace" },
  { id: "alacritty", name: "Alacritty", group: "Terminals", type: "workspace" },
  { id: "kitty", name: "Kitty", group: "Terminals", type: "workspace" },
  // Other IDEs
  { id: "xcode", name: "Xcode", group: "Other IDEs", type: "workspace" },
];

export const EDITOR_GROUPS: EditorGroup[] = ["VS Code", "JetBrains", "Text Editors", "Terminals", "Other IDEs"];

const CATALOG_MAP = new Map(EDITOR_CATALOG.map((e) => [e.id, e]));

/** Returns the target type for a known editor id; defaults to "file" for unknowns. */
export function getEditorTargetType(id: string): EditorTargetType {
  return CATALOG_MAP.get(id)?.type ?? "file";
}

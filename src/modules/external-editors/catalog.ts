export type EditorGroup = "VS Code" | "JetBrains" | "Text Editors" | "Other IDEs";
export type EditorTargetType = "file" | "workspace";

export interface CatalogEntry {
  id: string;
  name: string;
  group: EditorGroup;
  /** Whether this editor opens individual files or a project directory. */
  type: EditorTargetType;
}

export const EDITOR_CATALOG: CatalogEntry[] = [
  // VS Code family (open workspace root)
  { id: "vscode", name: "VS Code", group: "VS Code", type: "workspace" },
  { id: "vscode-insiders", name: "VS Code Insiders", group: "VS Code", type: "workspace" },
  { id: "vscodium", name: "VSCodium", group: "VS Code", type: "workspace" },
  { id: "cursor", name: "Cursor", group: "VS Code", type: "workspace" },
  { id: "windsurf", name: "Windsurf", group: "VS Code", type: "workspace" },
  { id: "kiro", name: "Kiro", group: "VS Code", type: "workspace" },
  { id: "trae", name: "Trae", group: "VS Code", type: "workspace" },
  { id: "trae-solo", name: "Trae Solo", group: "VS Code", type: "workspace" },
  { id: "antigravity", name: "Antigravity", group: "VS Code", type: "workspace" },
  // Text editors
  { id: "zed", name: "Zed", group: "Text Editors", type: "file" },
  { id: "zed-preview", name: "Zed Preview", group: "Text Editors", type: "file" },
  { id: "sublime-text", name: "Sublime Text", group: "Text Editors", type: "file" },
  { id: "atom", name: "Atom", group: "Text Editors", type: "file" },
  { id: "bbedit", name: "BBEdit", group: "Text Editors", type: "file" },
  { id: "cotedit", name: "CotEditor", group: "Text Editors", type: "file" },
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
  // Other IDEs
  { id: "xcode", name: "Xcode", group: "Other IDEs", type: "workspace" },
];

export const EDITOR_GROUPS: EditorGroup[] = ["VS Code", "JetBrains", "Text Editors", "Other IDEs"];

const CATALOG_MAP = new Map(EDITOR_CATALOG.map((e) => [e.id, e]));

/** Returns the target type for a known editor id; defaults to "file" for unknowns. */
export function getEditorTargetType(id: string): EditorTargetType {
  return CATALOG_MAP.get(id)?.type ?? "file";
}

/** Returns true if the editor id belongs to the "Text Editors" catalog group. */
export function isTextEditorGroup(id: string): boolean {
  return CATALOG_MAP.get(id)?.group === "Text Editors";
}

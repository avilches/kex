export type EditorGroup = "VS Code" | "JetBrains" | "Text Editors" | "Other IDEs";
export type EditorTargetType = "file" | "workspace";

/** What an app can be pointed at: a file, a folder, or either. */
export type AppAccepts = "file" | "folder" | "both";

export interface CatalogEntry {
  id: string;
  name: string;
  group: EditorGroup;
  /** Whether this editor opens individual files or a project directory. */
  type: EditorTargetType;
  /** What a launch may point it at. Project-based IDEs open folders only; the rest take either. */
  accepts: AppAccepts;
}

export const EDITOR_CATALOG: CatalogEntry[] = [
  // VS Code family (open workspace root)
  { id: "vscode", name: "VS Code", group: "VS Code", type: "workspace", accepts: "both" },
  { id: "vscode-insiders", name: "VS Code Insiders", group: "VS Code", type: "workspace", accepts: "both" },
  { id: "vscodium", name: "VSCodium", group: "VS Code", type: "workspace", accepts: "both" },
  { id: "cursor", name: "Cursor", group: "VS Code", type: "workspace", accepts: "both" },
  { id: "windsurf", name: "Windsurf", group: "VS Code", type: "workspace", accepts: "both" },
  { id: "kiro", name: "Kiro", group: "VS Code", type: "workspace", accepts: "both" },
  { id: "trae", name: "Trae", group: "VS Code", type: "workspace", accepts: "both" },
  { id: "trae-solo", name: "Trae Solo", group: "VS Code", type: "workspace", accepts: "both" },
  { id: "antigravity", name: "Antigravity", group: "VS Code", type: "workspace", accepts: "both" },
  // Text editors
  { id: "zed", name: "Zed", group: "Text Editors", type: "file", accepts: "both" },
  { id: "zed-preview", name: "Zed Preview", group: "Text Editors", type: "file", accepts: "both" },
  { id: "sublime-text", name: "Sublime Text", group: "Text Editors", type: "file", accepts: "both" },
  { id: "atom", name: "Atom", group: "Text Editors", type: "file", accepts: "both" },
  { id: "bbedit", name: "BBEdit", group: "Text Editors", type: "file", accepts: "both" },
  { id: "cotedit", name: "CotEditor", group: "Text Editors", type: "file", accepts: "both" },
  { id: "coderunner", name: "CodeRunner", group: "Text Editors", type: "file", accepts: "both" },
  // JetBrains (project/workspace-based)
  { id: "intellij", name: "IntelliJ IDEA", group: "JetBrains", type: "workspace", accepts: "folder" },
  { id: "pycharm", name: "PyCharm", group: "JetBrains", type: "workspace", accepts: "folder" },
  { id: "webstorm", name: "WebStorm", group: "JetBrains", type: "workspace", accepts: "folder" },
  { id: "goland", name: "GoLand", group: "JetBrains", type: "workspace", accepts: "folder" },
  { id: "rubymine", name: "RubyMine", group: "JetBrains", type: "workspace", accepts: "folder" },
  { id: "rustrover", name: "RustRover", group: "JetBrains", type: "workspace", accepts: "folder" },
  { id: "android-studio", name: "Android Studio", group: "JetBrains", type: "workspace", accepts: "folder" },
  { id: "rider", name: "Rider", group: "JetBrains", type: "workspace", accepts: "folder" },
  { id: "appcode", name: "AppCode", group: "JetBrains", type: "workspace", accepts: "folder" },
  { id: "clion", name: "CLion", group: "JetBrains", type: "workspace", accepts: "folder" },
  { id: "phpstorm", name: "PhpStorm", group: "JetBrains", type: "workspace", accepts: "folder" },
  { id: "mps", name: "MPS", group: "JetBrains", type: "workspace", accepts: "folder" },
  { id: "android-studio-canary", name: "Android Studio Canary", group: "JetBrains", type: "workspace", accepts: "folder" },
  // Other IDEs
  { id: "xcode", name: "Xcode", group: "Other IDEs", type: "workspace", accepts: "both" },
];

const CATALOG_MAP = new Map(EDITOR_CATALOG.map((e) => [e.id, e]));

/** Returns the target type for a known editor id; defaults to "file" for unknowns. */
export function getEditorTargetType(id: string): EditorTargetType {
  return CATALOG_MAP.get(id)?.type ?? "file";
}

/** Returns true if the editor id belongs to the "Text Editors" catalog group. */
export function isTextEditorGroup(id: string): boolean {
  return CATALOG_MAP.get(id)?.group === "Text Editors";
}

/** What the catalog says an app accepts; an app it does not know takes either. */
export function getEditorAccepts(id: string): AppAccepts {
  return CATALOG_MAP.get(id)?.accepts ?? "both";
}

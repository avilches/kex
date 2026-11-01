export type EditorGroup = "VS Code" | "JetBrains" | "Text Editors" | "Other IDEs";

/** What an app can be pointed at: a file, a folder, or either. */
export type AppAccepts = "file" | "folder" | "both";

/** A folder is the safe side: an app offered for what it cannot open fails, one left out is a click away. */
export const DEFAULT_ACCEPTS: AppAccepts = "folder";

export interface CatalogEntry {
  id: string;
  name: string;
  group: EditorGroup;
}

const entry = (group: EditorGroup) => (id: string, name: string): CatalogEntry => ({ id, name, group });

const vscode = entry("VS Code");
const text = entry("Text Editors");
const jetbrains = entry("JetBrains");
const other = entry("Other IDEs");

export const EDITOR_CATALOG: CatalogEntry[] = [
  vscode("vscode", "VS Code"),
  vscode("vscode-insiders", "VS Code Insiders"),
  vscode("vscodium", "VSCodium"),
  vscode("cursor", "Cursor"),
  vscode("windsurf", "Windsurf"),
  vscode("kiro", "Kiro"),
  vscode("trae", "Trae"),
  vscode("trae-solo", "Trae Solo"),
  vscode("antigravity", "Antigravity"),
  text("zed", "Zed"),
  text("zed-preview", "Zed Preview"),
  text("sublime-text", "Sublime Text"),
  text("atom", "Atom"),
  text("bbedit", "BBEdit"),
  text("cotedit", "CotEditor"),
  text("coderunner", "CodeRunner"),
  jetbrains("intellij", "IntelliJ IDEA"),
  jetbrains("pycharm", "PyCharm"),
  jetbrains("webstorm", "WebStorm"),
  jetbrains("goland", "GoLand"),
  jetbrains("rubymine", "RubyMine"),
  jetbrains("rustrover", "RustRover"),
  jetbrains("android-studio", "Android Studio"),
  jetbrains("rider", "Rider"),
  jetbrains("appcode", "AppCode"),
  jetbrains("clion", "CLion"),
  jetbrains("phpstorm", "PhpStorm"),
  jetbrains("mps", "MPS"),
  jetbrains("android-studio-canary", "Android Studio Canary"),
  other("xcode", "Xcode"),
];

const CATALOG_MAP = new Map(EDITOR_CATALOG.map((e) => [e.id, e]));

/** What a group of apps takes: the project-based IDEs open folders only, the rest take either. */
export function acceptsOfGroup(group: EditorGroup): AppAccepts {
  return group === "JetBrains" ? "folder" : "both";
}

/** What the catalog says an app accepts; an app it does not know takes the default. */
export function getEditorAccepts(id: string): AppAccepts {
  const known = CATALOG_MAP.get(id);
  return known ? acceptsOfGroup(known.group) : DEFAULT_ACCEPTS;
}

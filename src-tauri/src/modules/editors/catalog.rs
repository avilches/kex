/// Static descriptor for a known editor. Used by detect.rs to probe the system.
pub struct EditorEntry {
    /// Stable identifier used in preferences and as the icon filename key.
    pub id: &'static str,
    /// Display name shown in the UI.
    pub name: &'static str,
    /// macOS bundle identifier for mdfind detection.
    pub bundle_id: Option<&'static str>,
    /// CLI binary name for PATH lookup (all platforms).
    pub cli_binary: &'static str,
    /// Args injected between the binary and the path at launch time.
    /// Empty for most editors. JetBrains via `open -na` needs `["-na", "<App>.app", "--args"]`.
    pub args_before_path: &'static [&'static str],
    /// macOS app display name for `open -na` fallback (JetBrains only).
    pub macos_app_name: Option<&'static str>,
}

pub static CATALOG: &[EditorEntry] = &[
    // --- VS Code family ---
    EditorEntry { id: "vscode", name: "VS Code", bundle_id: Some("com.microsoft.VSCode"), cli_binary: "code", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "vscode-insiders", name: "VS Code Insiders", bundle_id: Some("com.microsoft.VSCodeInsiders"), cli_binary: "code-insiders", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "vscodium", name: "VSCodium", bundle_id: Some("com.vscodium"), cli_binary: "codium", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "cursor", name: "Cursor", bundle_id: Some("com.todesktop.230313mzl4w4u92"), cli_binary: "cursor", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "windsurf", name: "Windsurf", bundle_id: Some("com.exafunction.windsurf"), cli_binary: "windsurf", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "zed", name: "Zed", bundle_id: Some("dev.zed.Zed"), cli_binary: "zed", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "zed-preview", name: "Zed Preview", bundle_id: Some("dev.zed.Zed-Preview"), cli_binary: "zed", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "kiro", name: "Kiro", bundle_id: Some("software.amazon.kiro.Kiro"), cli_binary: "kiro", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "trae", name: "Trae", bundle_id: Some("com.bytedance.trae"), cli_binary: "trae", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "antigravity", name: "Antigravity", bundle_id: Some("com.google.antigravity"), cli_binary: "antigravity", args_before_path: &[], macos_app_name: None },
    // --- Text editors ---
    EditorEntry { id: "sublime-text", name: "Sublime Text", bundle_id: Some("com.sublimetext.4"), cli_binary: "subl", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "atom", name: "Atom", bundle_id: Some("com.github.atom"), cli_binary: "atom", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "bbedit", name: "BBEdit", bundle_id: Some("com.barebones.bbedit"), cli_binary: "bbedit", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "cotedit", name: "CotEditor", bundle_id: Some("com.coteditor.CotEditor"), cli_binary: "cot", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "textmate", name: "TextMate", bundle_id: Some("com.macromates.TextMate"), cli_binary: "mate", args_before_path: &[], macos_app_name: None },
    EditorEntry { id: "coderunner", name: "CodeRunner", bundle_id: Some("com.krill.CodeRunner"), cli_binary: "", args_before_path: &[], macos_app_name: None },
    // --- JetBrains IDEs ---
    EditorEntry { id: "intellij", name: "IntelliJ IDEA", bundle_id: Some("com.jetbrains.intellij"), cli_binary: "idea", args_before_path: &[], macos_app_name: Some("IntelliJ IDEA") },
    EditorEntry { id: "pycharm", name: "PyCharm", bundle_id: Some("com.jetbrains.pycharm"), cli_binary: "pycharm", args_before_path: &[], macos_app_name: Some("PyCharm") },
    EditorEntry { id: "webstorm", name: "WebStorm", bundle_id: Some("com.jetbrains.WebStorm"), cli_binary: "webstorm", args_before_path: &[], macos_app_name: Some("WebStorm") },
    EditorEntry { id: "goland", name: "GoLand", bundle_id: Some("com.jetbrains.goland"), cli_binary: "goland", args_before_path: &[], macos_app_name: Some("GoLand") },
    EditorEntry { id: "rubymine", name: "RubyMine", bundle_id: Some("com.jetbrains.rubymine"), cli_binary: "rubymine", args_before_path: &[], macos_app_name: Some("RubyMine") },
    EditorEntry { id: "rustrover", name: "RustRover", bundle_id: Some("com.jetbrains.rustrover"), cli_binary: "rustrover", args_before_path: &[], macos_app_name: Some("RustRover") },
    EditorEntry { id: "android-studio", name: "Android Studio", bundle_id: Some("com.google.android.studio"), cli_binary: "studio", args_before_path: &[], macos_app_name: Some("Android Studio") },
    EditorEntry { id: "rider", name: "Rider", bundle_id: Some("com.jetbrains.rider"), cli_binary: "rider", args_before_path: &[], macos_app_name: Some("Rider") },
    EditorEntry { id: "appcode", name: "AppCode", bundle_id: Some("com.jetbrains.AppCode"), cli_binary: "appcode", args_before_path: &[], macos_app_name: Some("AppCode") },
    EditorEntry { id: "clion", name: "CLion", bundle_id: Some("com.jetbrains.clion"), cli_binary: "clion", args_before_path: &[], macos_app_name: Some("CLion") },
    EditorEntry { id: "phpstorm", name: "PhpStorm", bundle_id: Some("com.jetbrains.PhpStorm"), cli_binary: "phpstorm", args_before_path: &[], macos_app_name: Some("PhpStorm") },
    EditorEntry { id: "mps", name: "MPS", bundle_id: Some("com.jetbrains.mps"), cli_binary: "mps", args_before_path: &[], macos_app_name: Some("MPS") },
];

pub fn is_jetbrains(id: &str) -> bool {
    matches!(id, "intellij" | "pycharm" | "webstorm" | "goland" | "rubymine"
        | "rustrover" | "android-studio" | "rider" | "appcode" | "clion"
        | "phpstorm" | "mps")
}

/// Editors that have no CLI and are launched via `open -b <bundle_id>` on macOS only.
pub fn is_macos_open_only(id: &str) -> bool {
    matches!(id, "bbedit" | "cotedit" | "textmate" | "coderunner")
}

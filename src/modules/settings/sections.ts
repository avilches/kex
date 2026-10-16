import {
  ColorsIcon,
  ComputerTerminal01Icon,
  DocumentCodeIcon,
  File02Icon,
  InformationCircleIcon,
  KeyboardIcon,
  Layers01Icon,
  PaintBoardIcon,
  Settings01Icon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import type { SettingsSection } from "./openSettingsWindow";

export type SettingsSectionMeta = {
  id: SettingsSection;
  label: string;
  icon: typeof Settings01Icon;
};

// No components here: the main window imports this list, and pulling in the section
// components would drag the whole Settings tree into its bundle.
export const SETTINGS_SECTIONS: readonly SettingsSectionMeta[] = [
  { id: "general", label: "General", icon: Settings01Icon },
  { id: "workspaces", label: "Workspaces", icon: Layers01Icon },
  { id: "terminal", label: "Terminal", icon: ComputerTerminal01Icon },
  { id: "external-editors", label: "Tools", icon: DocumentCodeIcon },
  { id: "editor", label: "Editor", icon: SourceCodeIcon },
  { id: "filetypes", label: "File Types", icon: File02Icon },
  { id: "appearance", label: "Appearance", icon: PaintBoardIcon },
  { id: "themes", label: "Themes", icon: ColorsIcon },
  { id: "shortcuts", label: "Shortcuts", icon: KeyboardIcon },
  { id: "about", label: "About", icon: InformationCircleIcon },
];

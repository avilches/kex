import { useMemo } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { resolveTitleDefaults, type TitleDefaults } from "./defaultTitles";

// The default title templates in force, read from Settings > Appearance.
export function useTitleDefaults(): TitleDefaults {
  const terminal = usePreferencesStore((s) => s.titleTemplateTerminal);
  const agent = usePreferencesStore((s) => s.titleTemplateAgent);
  const file = usePreferencesStore((s) => s.titleTemplateFile);
  const browser = usePreferencesStore((s) => s.titleTemplateBrowser);
  const gitHistory = usePreferencesStore((s) => s.titleTemplateGitHistory);
  const workspace = usePreferencesStore((s) => s.titleTemplateWorkspace);
  return useMemo(
    () => resolveTitleDefaults({ terminal, agent, file, browser, gitHistory, workspace }),
    [terminal, agent, file, browser, gitHistory, workspace],
  );
}

// One-shot read, for callers outside React.
export function titleDefaultsNow(): TitleDefaults {
  const s = usePreferencesStore.getState();
  return resolveTitleDefaults({
    terminal: s.titleTemplateTerminal,
    agent: s.titleTemplateAgent,
    file: s.titleTemplateFile,
    browser: s.titleTemplateBrowser,
    gitHistory: s.titleTemplateGitHistory,
    workspace: s.titleTemplateWorkspace,
  });
}

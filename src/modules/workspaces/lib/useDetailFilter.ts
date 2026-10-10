import { useMemo } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { DetailFilter } from "./workspaceDetail";

export function useDetailFilter(): DetailFilter {
  const terminalsOn = usePreferencesStore((s) => s.workspaceDetailTerminalsEnabled);
  const terminalMode = usePreferencesStore((s) => s.workspaceDetailTerminals);
  const editors = usePreferencesStore((s) => s.workspaceDetailEditors);
  const browsers = usePreferencesStore((s) => s.workspaceDetailBrowsers);
  const git = usePreferencesStore((s) => s.workspaceDetailGit);
  const terminals = terminalsOn ? terminalMode : "none";
  return useMemo(
    () => ({ terminals, editors, browsers, git }),
    [terminals, editors, browsers, git],
  );
}

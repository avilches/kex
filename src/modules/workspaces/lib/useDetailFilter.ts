import { useMemo } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { DetailFilter } from "./workspaceDetail";

export function useDetailFilter(): DetailFilter {
  const terminals = usePreferencesStore((s) => s.workspaceDetailTerminals);
  const editors = usePreferencesStore((s) => s.workspaceDetailEditors);
  const browsers = usePreferencesStore((s) => s.workspaceDetailBrowsers);
  const git = usePreferencesStore((s) => s.workspaceDetailGit);
  return useMemo(
    () => ({ terminals, editors, browsers, git }),
    [terminals, editors, browsers, git],
  );
}

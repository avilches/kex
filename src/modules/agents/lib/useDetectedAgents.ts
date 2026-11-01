import { usePreferencesStore } from "@/modules/settings/preferences";
import { useMemo } from "react";
import { detectedAgentIds } from "./agentRows";

export function useDetectedAgentIds(): ReadonlySet<string> {
  const editors = usePreferencesStore((s) => s.detectedEditors);
  return useMemo(() => detectedAgentIds(editors), [editors]);
}

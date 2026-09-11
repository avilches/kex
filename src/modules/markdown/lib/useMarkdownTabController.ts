import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  type MarkdownTabMode,
  planModeSwitch,
  planSave,
  routeMarkdownShortcut,
  type SavePlan,
} from "@/modules/markdown/lib/markdownTabShell";
import { useMarkdownDocument } from "@/modules/markdown/lib/useMarkdownDocument";
import { usePreferencesStore } from "@/modules/settings/preferences";

function toDescription(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useMarkdownTabController(opts: {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
  serializeRich: () => string | null;
  saveSource: () => Promise<void>;
  onToggleOutline?: () => void;
}) {
  const [mode, setMode] = useState<MarkdownTabMode>("rich");
  const { doc, onChange, setBaseline, save, reload } = useMarkdownDocument({
    path: opts.path,
    onDirtyChange: opts.onDirtyChange,
  });
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);

  const runSavePlan = useCallback(
    async (plan: SavePlan) => {
      if (plan.flushRich) {
        const md = opts.serializeRich();
        if (md != null) onChange(md);
      }
      if (plan.saveDoc) await save();
      if (plan.saveSource) await opts.saveSource();
    },
    [opts.serializeRich, opts.saveSource, onChange, save],
  );

  const toggleMode = useCallback(async () => {
    const plan = planModeSwitch(mode);
    try {
      await runSavePlan(plan);
    } catch (e) {
      toast.error("Could not switch mode", { description: toDescription(e) });
      return;
    }
    if (plan.reload) reload();
    setMode(plan.nextMode);
  }, [mode, runSavePlan, reload]);

  const saveNow = useCallback(
    () => runSavePlan(planSave(mode)),
    [mode, runSavePlan],
  );

  const handleShortcut = useCallback(
    (e: KeyboardEvent): boolean => {
      const action = routeMarkdownShortcut(e, userShortcuts, opts.onToggleOutline != null);
      if (action === "save") {
        saveNow().catch((err) =>
          toast.error("Save failed", { description: toDescription(err) }),
        );
        return true;
      }
      if (action === "toggleSource") {
        void toggleMode();
        return true;
      }
      if (action === "toggleOutline") {
        opts.onToggleOutline?.();
        return true;
      }
      return false;
    },
    [userShortcuts, saveNow, toggleMode, opts.onToggleOutline],
  );

  return { mode, doc, onChange, setBaseline, save, reload, toggleMode, saveNow, handleShortcut };
}

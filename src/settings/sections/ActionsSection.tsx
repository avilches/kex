import { PlusSignIcon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { newActionId } from "@/lib/ids";
import {
  ActionIcon,
  ActionsEditor,
  addAction,
  globalActions,
  removeAction,
  reorderActions,
  suggestionsFromDetected,
  unlinkRemovedActions,
  updateAction,
  type Action,
  type AppSuggestion,
} from "@/modules/actions";
import { useExternalEditors } from "@/modules/external-editors";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { SectionHeader } from "../components/SectionHeader";

function report(err: unknown) {
  console.error("Could not save the global actions", err);
  toast.error("Could not save the actions");
}

// Edits go through the serialized global store, so a change made while another is still
// being written starts from the list that write carries, and a failed write is undone. The
// promise rejects on a failed write, so the editor can keep the row it was typing.
function edit(fn: (list: Action[]) => Action[]): Promise<void> {
  return globalActions
    .change(fn)
    .then(({ before, after }) => unlinkRemovedActions(before, after))
    .catch((err: unknown) => {
      report(err);
      throw err;
    });
}

function editQuietly(fn: (list: Action[]) => Action[]) {
  edit(fn).catch(() => {});
}

function newActionFromSuggestion(s: AppSuggestion): Action {
  return {
    id: newActionId(),
    name: s.name,
    runInTerminal: false,
    command: s.defaultCommand,
    ...(s.appId ? { appId: s.appId } : {}),
    ownButton: false,
  };
}

export function ActionsSection() {
  const actions = usePreferencesStore((s) => s.actions);
  const { detectedEditors, isScanning, scan } = useExternalEditors();

  const didScan = useRef(false);
  useEffect(() => {
    if (!didScan.current && detectedEditors.length === 0 && !isScanning) {
      didScan.current = true;
      scan();
    }
  }, [detectedEditors.length, isScanning, scan]);

  const suggestions = suggestionsFromDetected(detectedEditors);
  const used = new Set(actions.map((a) => a.appId).filter(Boolean));
  const offered = suggestions.filter((s) => !s.appId || !used.has(s.appId));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Actions" />
        <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-[11px]" onClick={scan} disabled={isScanning}>
          <HugeiconsIcon icon={Refresh01Icon} size={12} strokeWidth={2} />
          {isScanning ? "Scanning..." : "Scan"}
        </Button>
      </div>

      <p className="-mt-2 text-[11.5px] text-muted-foreground">
        Global actions are available in every workspace. A script runs in a terminal and can be stopped; an app opens
        in the background. Actions of a single project live in its workspace settings.
      </p>

      <ActionsEditor
        actions={actions}
        suggestions={suggestions}
        context={null}
        emptyHint="No global actions yet. Add one, or start from an app detected on this computer below."
        onAdd={(action) => edit((list) => addAction(list, action))}
        onUpdate={(id, next) => editQuietly((list) => updateAction(list, id, next))}
        onRemove={(id) => editQuietly((list) => removeAction(list, id))}
        onReorder={(from, to) => editQuietly((list) => reorderActions(list, from, to))}
      />

      {offered.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Detected on this computer
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {offered.map((s) => (
              <button
                key={s.key}
                type="button"
                title={s.defaultCommand}
                onClick={() => editQuietly((list) => addAction(list, newActionFromSuggestion(s)))}
                className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-[12px] text-foreground transition-colors hover:bg-muted/60"
              >
                <ActionIcon action={{ appId: s.appId, runInTerminal: false }} size={13} />
                {s.name}
                <HugeiconsIcon icon={PlusSignIcon} size={11} strokeWidth={2} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

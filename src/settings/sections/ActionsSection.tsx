import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ActionsEditor,
  addAction,
  globalActions,
  removeAction,
  reorderActions,
  suggestionsFromDetected,
  unlinkRemovedActions,
  updateAction,
  type Action,
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
        suggestions={suggestionsFromDetected(detectedEditors)}
        context={null}
        emptyHint="No global actions yet. Add a command or pick an application above."
        onAdd={(action) => edit((list) => addAction(list, action))}
        onUpdate={(id, next) => editQuietly((list) => updateAction(list, id, next))}
        onRemove={(id) => editQuietly((list) => removeAction(list, id))}
        onReorder={(from, to) => editQuietly((list) => reorderActions(list, from, to))}
      />
    </div>
  );
}

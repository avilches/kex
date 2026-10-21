import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
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
import { useWorkspaceActionsFeed } from "@/modules/actions/lib/actionsFeed";
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

type Tab = "global" | "workspace";

export function ActionsSection() {
  const actions = usePreferencesStore((s) => s.actions);
  const { detectedEditors, isScanning, scan } = useExternalEditors();
  const { feed, send } = useWorkspaceActionsFeed();
  const [tab, setTab] = useState<Tab>("global");

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
          {isScanning ? "Scanning..." : "Scan applications"}
        </Button>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(
          [
            ["global", "Global"],
            ["workspace", feed ? `Current workspace: ${feed.workspaceName}` : "Current workspace"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cnTab(tab === id)}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="-mt-2 text-[11.5px] text-muted-foreground">
        {tab === "global"
          ? "Global actions are available in every workspace. A script runs in a terminal and can be stopped; an app opens in the background."
          : "Actions of the current workspace are available in it alone; every tab of the app shares them."}
      </p>

      {tab === "global" ? (
        <ActionsEditor
          actions={actions}
          suggestions={suggestionsFromDetected(detectedEditors)}
          context={null}
          emptyHint="No global actions yet. Add a command or pick an application above."
          onAdd={(action) => edit((list) => addAction(list, action))}
          onUpdate={(id, next) => editQuietly((list) => updateAction(list, id, next))}
          onRemove={(id) => editQuietly((list) => removeAction(list, id))}
          onReorder={(from, to) => editQuietly((list) => reorderActions(list, from, to))}
          onMoveToWorkspace={feed ? (id) => send({ kind: "toWorkspace", workspaceId: feed.workspaceId, id }) : undefined}
        />
      ) : feed ? (
        <ActionsEditor
          key={feed.workspaceId}
          actions={feed.actions}
          suggestions={suggestionsFromDetected(detectedEditors)}
          context={feed.context}
          emptyHint={`No actions in ${feed.workspaceName} yet. Add a command or pick an application above.`}
          onAdd={(action) => send({ kind: "add", workspaceId: feed.workspaceId, action })}
          onUpdate={(id, next) => send({ kind: "update", workspaceId: feed.workspaceId, id, action: next })}
          onRemove={(id) => send({ kind: "remove", workspaceId: feed.workspaceId, id })}
          onReorder={(from, to) => send({ kind: "reorder", workspaceId: feed.workspaceId, fromId: from, toId: to })}
          onMoveToGlobal={(id) => send({ kind: "toGlobal", workspaceId: feed.workspaceId, id })}
        />
      ) : (
        <p className="text-[11.5px] text-muted-foreground">The app does not report a workspace. Open a workspace and reload this window.</p>
      )}
    </div>
  );
}

function cnTab(active: boolean): string {
  return [
    "-mb-px px-3 py-1.5 text-[12px] font-medium outline-none transition-colors focus-visible:outline-none",
    active ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground",
  ].join(" ");
}

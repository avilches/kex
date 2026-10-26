import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ActionsColumns,
  addAction,
  agentSuggestionsFromDetected,
  globalActions,
  removeAction,
  reorderActions,
  suggestionsFromDetected,
  unlinkRemovedActions,
  updateAction,
  type Action,
} from "@/modules/actions";
import { useWorkspaceActionsFeed } from "@/modules/actions/lib/actionsFeed";
import type { ActionsTarget } from "@/modules/actions/lib/actionsTarget";
import { useExternalEditors } from "@/modules/external-editors";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { SectionHeader } from "../components/SectionHeader";

function report(err: unknown) {
  console.error("Could not save the global actions", err);
  toast.error("Could not save the actions");
}

// Edits go through the serialized global store, so a change made while another is still
// being written starts from the list that write carries, and a failed write is undone. The
// promise rejects on a failed write, so the editor can keep the draft it was typing.
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

/** A request to open one Action in its modal, that a new `nonce` makes again. */
export type ActionsRequest = ActionsTarget & { nonce: number };

export function ActionsSection({ target = null }: { target?: ActionsRequest | null }) {
  const actions = usePreferencesStore((s) => s.actions);
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const { detectedEditors, detectedAgents, isScanning, scan } = useExternalEditors();
  const suggestions = useMemo(
    () => [...suggestionsFromDetected(detectedEditors), ...agentSuggestionsFromDetected(detectedAgents)],
    [detectedEditors, detectedAgents],
  );
  const { feed, send } = useWorkspaceActionsFeed();
  const focusRequest = target?.id ? { scope: target.tab, id: target.id, nonce: target.nonce } : undefined;

  const didScan = useRef(false);
  useEffect(() => {
    if (hydrated && !didScan.current && detectedEditors.length === 0 && !isScanning) {
      didScan.current = true;
      scan();
    }
  }, [hydrated, detectedEditors.length, isScanning, scan]);

  const workspaceId = feed?.workspaceId;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Actions" />
        <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-[11px]" onClick={scan} disabled={isScanning}>
          <HugeiconsIcon icon={Refresh01Icon} size={12} strokeWidth={2} />
          {isScanning ? "Scanning..." : "Scan applications"}
        </Button>
      </div>

      <p className="-mt-2 text-[11.5px] text-muted-foreground">
        Global actions are available in any workspace; the ones of the current workspace only in it. Drag actions to the other
        column to move them between global and this workspace.
      </p>

      <ActionsColumns
        key={workspaceId}
        focusRequest={focusRequest}
        suggestions={suggestions}
        workspaceName={feed?.workspaceName ?? null}
        global={{
          actions,
          context: null,
          available: true,
          onAdd: (action) => edit((list) => addAction(list, action)),
          onUpdate: (id, next) => editQuietly((list) => updateAction(list, id, next)),
          onRemove: (id) => editQuietly((list) => removeAction(list, id)),
          onReorder: (from, to) => editQuietly((list) => reorderActions(list, from, to)),
        }}
        workspace={{
          actions: feed?.actions ?? [],
          context: feed?.context ?? null,
          available: workspaceId !== undefined,
          onAdd: (action) => (workspaceId ? send({ kind: "add", workspaceId, action }) : undefined),
          onUpdate: (id, next) => workspaceId && send({ kind: "update", workspaceId, id, action: next }),
          onRemove: (id) => workspaceId && send({ kind: "remove", workspaceId, id }),
          onReorder: (from, to) => workspaceId && send({ kind: "reorder", workspaceId, fromId: from, toId: to }),
        }}
        onMove={(from, _to, id) => {
          if (!workspaceId) return;
          send({ kind: from === "global" ? "toWorkspace" : "toGlobal", workspaceId, id });
        }}
      />
    </div>
  );
}

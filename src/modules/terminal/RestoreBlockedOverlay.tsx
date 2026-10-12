import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { openWithoutRestoring, retryRestore } from "./lib/useTerminalSession";
import type { RestoreBlock } from "./lib/restoreStart";

type Props = { leafId: string; block: RestoreBlock };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <code className="select-text break-all rounded border border-border bg-muted/40 px-2 py-1.5 font-mono text-[12px] text-foreground">
        {value || "-"}
      </code>
    </div>
  );
}

// Covers only the tab whose terminal could not start: the rest of the pane stays usable.
export function RestoreBlockedOverlay({ leafId, block }: Props) {
  const [busy, setBusy] = useState(false);
  const run = (action: (id: string) => Promise<void>) => {
    setBusy(true);
    void action(leafId).finally(() => setBusy(false));
  };
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Terminal restore failed"
      className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--terminal-background)] p-6"
    >
      <div className="flex w-full max-w-lg flex-col gap-4 text-foreground">
        <div className="flex items-start gap-2.5">
          <HugeiconsIcon icon={Alert02Icon} size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-amber-500" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[14px] font-medium">This terminal could not be restored</span>
            <span className="select-text break-words text-[12.5px] text-muted-foreground">{block.reason}</span>
          </div>
        </div>
        <Field label="Directory" value={block.dir} />
        <Field label="Command" value={block.command} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => run(openWithoutRestoring)}>
            Cancel restore
          </Button>
          <Button autoFocus disabled={busy} onClick={() => run(retryRestore)}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}

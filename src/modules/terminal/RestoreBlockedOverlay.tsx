import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRestoreBusy } from "./lib/restoreBusy";
import { retryRestore } from "./lib/useTerminalSession";
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
  const [acting, setActing] = useState(false);
  const retrying = useRestoreBusy(leafId);
  const busy = acting || retrying;
  const run = (action: (id: string) => Promise<void>) => {
    setActing(true);
    void action(leafId).finally(() => setActing(false));
  };
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Terminal restore failed"
      className="absolute inset-0 z-30 flex items-center justify-center bg-background p-6"
    >
      <div className="flex w-full max-w-lg flex-col gap-4 text-foreground">
        <div className="flex items-start gap-2.5">
          <HugeiconsIcon icon={Alert02Icon} size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-amber-500" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[14px] font-medium">This terminal could not be restored</span>
            <span className="select-text break-words text-[12.5px] text-muted-foreground">{block.reason}</span>
          </div>
        </div>
        <Field label="Folder" value={block.dir} />
        <Field label="Command" value={block.command} />
        <div className="flex justify-end gap-2">
          <Button autoFocus disabled={busy} onClick={() => run(retryRestore)} className="gap-2">
            {retrying && <Spinner size={16} className="text-current" />}
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}

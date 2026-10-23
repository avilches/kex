import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import type { AgentId, IntegrationBlock } from "@/modules/agents/lib/integrations";
import type { IntegrationState } from "@/modules/agents/lib/useIntegration";
import { useEffect, useRef, useState } from "react";
import { IntegrationDiffDialog } from "./IntegrationDiffDialog";

const CHANGE_ANIMATION_MS = 700;

const BLOCK_LABEL: Record<IntegrationBlock, string> = {
  malformed: "Cannot read config",
  unavailable: "Not found",
};

function blockText(block: IntegrationBlock, name: string, files: string[]): string {
  return block === "malformed"
    ? `Kex cannot parse ${files.join(" or ")} and leaves them untouched. Fix it and check again.`
    : `The ${name} folder does not exist yet. Install ${name} and run it once, then check again.`;
}

type Props = {
  agent: AgentId;
  name: string;
  /** Where the integration lives, as the user would type it. */
  files: string[];
  state: IntegrationState;
};

export function AgentIntegrationRow({ agent, name, files, state }: Props) {
  const { ready, blocked, busy, failed, install, remove, refresh } = state;
  const [previewing, setPreviewing] = useState(false);
  const [justChanged, setJustChanged] = useState(false);
  const previous = useRef(ready);

  // The first check is not a change; only an install or an uninstall the user just made animates.
  useEffect(() => {
    const before = previous.current;
    previous.current = ready;
    if (before === null || ready === null || before === ready) return;
    setJustChanged(true);
    const t = setTimeout(() => setJustChanged(false), CHANGE_ANIMATION_MS);
    return () => clearTimeout(t);
  }, [ready]);

  const installed = ready === true;
  const act = () => void (installed ? remove() : install());

  return (
    <>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <AgentIcon agent={agent} size={22} className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-[12.5px] font-medium">
            {name}
            {ready !== null && (
              <span
                className={cn(
                  "relative flex items-center gap-1.5 text-[11px] font-normal transition-colors duration-300",
                  installed
                    ? "text-green-500"
                    : blocked === "malformed"
                      ? "text-destructive"
                      : "text-muted-foreground",
                )}
              >
                <span className="relative flex size-1.5">
                  {justChanged && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" />
                  )}
                  <span className="relative size-1.5 rounded-full bg-current" />
                </span>
                {installed ? "Installed" : blocked ? BLOCK_LABEL[blocked] : "Not installed"}
              </span>
            )}
          </span>
          <span className="truncate font-mono text-[10.5px] text-muted-foreground">
            {files.join(", ")}
            <button
              type="button"
              className="ml-2 cursor-pointer font-sans text-primary hover:underline disabled:opacity-60"
              disabled={ready === null || blocked !== null}
              onClick={() => setPreviewing(true)}
            >
              View changes
            </button>
          </span>
        </div>
        {blocked ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 min-w-[92px] px-2.5 text-[11px] active:scale-[0.96]"
            onClick={refresh}
          >
            Check again
          </Button>
        ) : (
          <Button
            key={String(installed)}
            size="sm"
            variant={installed ? "outline" : "default"}
            className={cn(
              "h-8 min-w-[92px] px-2.5 text-[11px] transition-colors active:scale-[0.96]",
              installed &&
                "text-muted-foreground hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive",
              justChanged && "animate-in fade-in slide-in-from-bottom-1 duration-300",
            )}
            disabled={busy || ready === null}
            onClick={act}
          >
            {busy ? (
              <>
                <Spinner size={12} />
                {installed ? "Removing" : "Installing"}
              </>
            ) : installed ? (
              "Uninstall"
            ) : (
              "Install"
            )}
          </Button>
        )}
      </div>
      {blocked && (
        <p className="px-3 pb-2 text-[11px] text-muted-foreground">
          {blockText(blocked, name, files)}
        </p>
      )}
      {failed && (
        <p className="px-3 pb-2 text-[11px] text-destructive">
          Could not change the {name} integration. Check the permissions of {files.join(", ")}.
        </p>
      )}
      <IntegrationDiffDialog
        agent={agent}
        name={name}
        install={!installed}
        open={previewing}
        busy={busy}
        onOpenChange={setPreviewing}
        onConfirm={() => {
          setPreviewing(false);
          act();
        }}
      />
    </>
  );
}

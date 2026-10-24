import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { updateIntegrationSuggestions } from "@/modules/settings/store";
import { AlertCircleIcon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { withMarkerDismissed } from "../lib/integrationSuggestion";
import { AGENT_LABELS, type AgentId } from "../lib/integrations";
import { useIntegrationWarningStore } from "../store/integrationWarningStore";

const CLOSE_DELAY_MS = 150;

// The exclamation shown in a tab whose agent runs without the Kex integration. Hovering it
// opens a small card; the card stays open while the pointer is on the icon or on the card.
export function IntegrationTabMarker({ agent }: { agent: AgentId }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const name = AGENT_LABELS[agent];

  const cancelClose = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const hide = () => {
    cancelClose();
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  useEffect(() => cancelClose, []);

  const dismiss = () => {
    setOpen(false);
    useIntegrationWarningStore.getState().clearAgent(agent);
    void updateIntegrationSuggestions((map) => withMarkerDismissed(map, agent)).catch((e) =>
      console.error("[kex] could not record the dismissed marker:", e),
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span
          className="ml-0.5 flex shrink-0 items-center text-amber-400"
          role="img"
          aria-label={`${name} agent detected without the Kex integration`}
          onPointerEnter={show}
          onPointerLeave={hide}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <HugeiconsIcon icon={AlertCircleIcon} size={13} strokeWidth={2} />
        </span>
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-64 gap-2 p-3"
        onPointerEnter={show}
        onPointerLeave={hide}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-start gap-2">
          <p className="flex-1 text-xs leading-snug">
            {name} agent detected. Open settings to install integration
          </p>
          <button
            type="button"
            className="flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            title="Open settings"
            aria-label="Open settings"
            onClick={() => {
              setOpen(false);
              void openSettingsWindow("general");
            }}
          >
            <HugeiconsIcon icon={Settings01Icon} size={12} strokeWidth={2} />
          </button>
        </div>
        <button
          type="button"
          className="self-start text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={dismiss}
        >
          Don't remind me again
        </button>
      </PopoverContent>
    </Popover>
  );
}

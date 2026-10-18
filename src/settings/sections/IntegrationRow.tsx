import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIntegration } from "@/modules/agents/lib/useIntegration";
import type { IntegrationAgent } from "@/modules/agents/lib/integrations";
import { CancelCircleIcon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SettingRow } from "../components/SettingRow";

type Props = {
  agent: IntegrationAgent;
  name: string;
  kind: "plugin" | "extension";
  file: string;
};

export function IntegrationRow({ agent, name, kind, file }: Props) {
  const { ready, busy, failed, install, remove } = useIntegration(agent);
  return (
    <>
      <SettingRow
        title={
          <span className="flex items-center gap-1.5">
            {name} integration
            {ready !== null && (
              <span
                className={cn(
                  "flex items-center gap-1 text-[11px] font-normal",
                  ready ? "text-green-500" : "text-destructive",
                )}
              >
                <HugeiconsIcon
                  icon={ready ? CheckmarkCircle02Icon : CancelCircleIcon}
                  size={12}
                  strokeWidth={2}
                />
                {ready ? "Installed" : "Not installed"}
              </span>
            )}
          </span>
        }
        description={
          ready
            ? `The Kex ${kind} is active: Kex restores your ${name} sessions and notifies you in the tab bar when ${name} needs input or finishes. Kex keeps it up to date. File: ${file}.`
            : `Install the Kex ${kind} so ${name} reports its sessions to Kex: your ${name} sessions are restored when you reopen it and the tab bar shows attention and finish signals. Writes ${file}.`
        }
      >
        <div className="flex items-center gap-1.5">
          {ready && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-[11px] text-muted-foreground"
              disabled={busy}
              onClick={() => void remove()}
            >
              Remove
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-[11px]"
            disabled={busy || ready === null}
            onClick={() => void install()}
          >
            {busy ? "Working..." : ready ? "Reinstall" : "Install"}
          </Button>
        </div>
      </SettingRow>
      {failed && (
        <p className="text-[11px] text-destructive">
          Could not change the {name} {kind}. Check the file permissions of {file}.
        </p>
      )}
    </>
  );
}

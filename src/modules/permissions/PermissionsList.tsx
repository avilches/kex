import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { native } from "@/lib/native";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  PERMISSION_KINDS,
  PERMISSION_LABELS,
  permissionAction,
  type PermissionKind,
  type PermissionRow,
} from "./lib/permissions";

const STATUS_TEXT: Record<PermissionRow, string> = {
  unchecked: "Not checked",
  checking: "Checking",
  granted: "Granted",
  denied: "Denied",
  unavailable: "Not present",
};

const STATUS_COLOR: Record<PermissionRow, string> = {
  unchecked: "text-muted-foreground",
  checking: "text-muted-foreground",
  granted: "text-green-500",
  denied: "text-destructive",
  unavailable: "text-muted-foreground",
};

const INITIAL = Object.fromEntries(
  PERMISSION_KINDS.map((k) => [k, "unchecked"]),
) as Record<PermissionKind, PermissionRow>;

type Props = { compact?: boolean };

export function PermissionsList({ compact = false }: Props) {
  const [rows, setRows] = useState(INITIAL);

  const check = async (kind: PermissionKind) => {
    setRows((r) => ({ ...r, [kind]: "checking" }));
    let state: PermissionRow;
    try {
      state = await native.permissionProbe(kind);
    } catch {
      state = "unchecked";
    }
    setRows((r) => ({ ...r, [kind]: state }));
  };

  const checkAll = () => void Promise.all(PERMISSION_KINDS.map(check));
  const busy = PERMISSION_KINDS.some((k) => rows[k] === "checking");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60 bg-card/60">
        {PERMISSION_KINDS.map((kind) => {
          const row = rows[kind];
          const action = permissionAction(row);
          return (
            <div
              key={kind}
              data-testid={`permission-${kind}`}
              className={cn(
                "flex items-center gap-3 px-3",
                compact ? "py-2" : "py-2.5",
                row === "unavailable" && "opacity-50",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-[12.5px] font-medium">{PERMISSION_LABELS[kind]}</span>
                <span className={cn("flex items-center gap-1.5 text-[11px]", STATUS_COLOR[row])}>
                  {row === "checking" ? (
                    <Spinner size={11} />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" />
                  )}
                  {STATUS_TEXT[row]}
                </span>
              </div>
              {action === "check" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 min-w-[92px] px-2.5 text-[11px] active:scale-[0.96]"
                  onClick={() => void check(kind)}
                >
                  Check
                </Button>
              )}
              {action === "openSettings" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-[11px] active:scale-[0.96]"
                  onClick={() => void native.permissionOpenSettings(kind)}
                >
                  Open System Settings
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10.5px] text-muted-foreground">
          Checking a folder you never decided on can show the macOS permission dialog. Once denied,
          macOS does not let an app ask again: the only way back is System Settings.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0 px-2.5 text-[11px] active:scale-[0.96]"
          disabled={busy}
          onClick={checkAll}
        >
          Check all
        </Button>
      </div>
    </div>
  );
}

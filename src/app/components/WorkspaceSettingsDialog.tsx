import { useEffect, useState } from "react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { Cancel01Icon, FolderOpenIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { native } from "@/lib/native";
import { useWorkspaceSettingsStore } from "@/modules/workspaces/lib/workspaceSettingsStore";
import {
  WORKSPACE_COLOR_PALETTE,
  resolveWorkspaceColor,
} from "@/modules/workspaces/lib/workspaceColor";
import type { Workspace, RunConfig } from "@/modules/workspaces/lib/types";
import type { ExplorerRootMode } from "@/modules/workspaces/lib/explorerRoot";

type Props = {
  workspaces: Workspace[];
  onSetTitle: (id: string, title: string) => void;
  onSetColor: (id: string, color: string | null) => void;
  onSetPinnedRoot: (id: string, path: string | undefined) => void;
  onSetExplorerRootMode: (id: string, mode: ExplorerRootMode) => void;
  onAddRunConfig: (id: string, config: RunConfig) => void;
  onUpdateRunConfig: (id: string, configId: string, patch: Partial<RunConfig>) => void;
  onRemoveRunConfig: (id: string, configId: string) => void;
  onReorderRunConfigs: (id: string, fromId: string, toId: string) => void;
};

export function WorkspaceSettingsDialog(props: Props) {
  const { open, workspaceId, closeSettings } = useWorkspaceSettingsStore();
  const ws = props.workspaces.find((w) => w.id === workspaceId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeSettings(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Workspace Settings</DialogTitle>
        </DialogHeader>
        {ws && (
          <WorkspaceSettingsForm key={ws.id} ws={ws} {...props} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type FormProps = { ws: Workspace } & Omit<Props, "workspaces">;

function WorkspaceSettingsForm({ ws, ...props }: FormProps) {
  const [cwdValue, setCwdValue] = useState(ws.pinnedRoot ?? "");
  const [cwdValid, setCwdValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!cwdValue) {
      setCwdValid(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const stat = await native.fsStat(cwdValue);
        setCwdValid(stat.kind === "dir");
      } catch {
        setCwdValid(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [cwdValue]);

  const displayColor = resolveWorkspaceColor(ws.color, ws.id);

  return (
    <div className="flex flex-col gap-5 py-1">
      {/* General: name + color */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">Name</label>
        <input
          className="h-8 rounded-md border border-border bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-1"
          defaultValue={ws.title}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v) props.onSetTitle(ws.id, v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium">Color</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* No color chip */}
          <button
            type="button"
            title="No color"
            onClick={() => props.onSetColor(ws.id, null)}
            className={cn(
              "size-6 rounded-full border-2 flex items-center justify-center bg-muted text-muted-foreground transition-colors",
              ws.color === null
                ? "border-foreground"
                : "border-transparent hover:border-muted-foreground/50",
            )}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
          </button>

          {/* Palette chips */}
          {WORKSPACE_COLOR_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              title={hex}
              onClick={() => props.onSetColor(ws.id, hex)}
              className={cn(
                "size-6 rounded-full border-2 transition-opacity",
                ws.color === hex
                  ? "border-foreground"
                  : "border-transparent hover:border-foreground/40",
              )}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>

        {/* Custom hex input */}
        <div className="flex items-center gap-2">
          <div
            className="size-6 shrink-0 rounded-full border border-border"
            style={displayColor ? { backgroundColor: displayColor } : undefined}
          />
          <input
            className="h-7 w-28 rounded border border-border bg-background px-2 text-xs font-mono outline-none ring-ring focus-visible:ring-1"
            placeholder="#rrggbb"
            value={
              ws.color != null &&
              !(WORKSPACE_COLOR_PALETTE as readonly string[]).includes(ws.color)
                ? ws.color
                : ""
            }
            onChange={(e) => {
              const v = e.target.value;
              if (/^#[0-9a-fA-F]{6}$/.test(v)) props.onSetColor(ws.id, v);
            }}
          />
        </div>
      </div>

      {/* Working Directory */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">Working Directory</label>
        <div className="flex items-center gap-1">
          <input
            className={cn(
              "h-8 flex-1 rounded-md border bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-1",
              cwdValid === false ? "border-destructive" : "border-border",
            )}
            value={cwdValue}
            onChange={(e) => setCwdValue(e.target.value)}
            onBlur={() => {
              if (!cwdValue) {
                props.onSetPinnedRoot(ws.id, undefined);
              } else if (cwdValid !== false) {
                props.onSetPinnedRoot(ws.id, cwdValue);
              }
            }}
            placeholder="Not set"
          />
          {cwdValue && (
            <button
              type="button"
              title="Clear"
              onClick={() => {
                setCwdValue("");
                setCwdValid(null);
                props.onSetPinnedRoot(ws.id, undefined);
              }}
              className="size-[22px] flex items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            title="Browse"
            onClick={async () => {
              const selected = await openFolderDialog({
                directory: true,
                defaultPath: cwdValue || undefined,
              });
              if (typeof selected === "string") {
                setCwdValue(selected);
                setCwdValid(null);
                props.onSetPinnedRoot(ws.id, selected);
              }
            }}
            className="size-[22px] flex items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={FolderOpenIcon} size={12} strokeWidth={2} />
          </button>
        </div>
        {cwdValid === false && (
          <p className="text-[11px] text-destructive">Folder does not exist</p>
        )}
      </div>

      {/* Run Configurations — wired in Task 7 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">Run Configurations</label>
        <p className="text-[11px] text-muted-foreground">Configure in the next update.</p>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentCodeIcon, ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setPreferredEditorId,
} from "@/modules/settings/store";
import { useExternalEditors, openWithEditor } from "./useExternalEditors";
import type { AnyEditor } from "./types";
import { toast } from "sonner";

export interface OpenInEditorTarget {
  path: string;
  kind: "file" | "dir";
}

interface Props {
  target: OpenInEditorTarget | null;
  onOpenSettings?: () => void;
}

function pathLabel(target: OpenInEditorTarget): string {
  const parts = target.path.split(/[\\/]/).filter(Boolean);
  if (target.kind === "file") return parts[parts.length - 1] ?? target.path;
  return parts[parts.length - 1] ?? target.path;
}

function EditorIcon({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <HugeiconsIcon icon={DocumentCodeIcon} size={14} strokeWidth={1.75} />;
  }
  return (
    <img
      src={`/assets/editors/${id}.svg`}
      alt={id}
      width={14}
      height={14}
      className="shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

export function OpenInEditorButton({ target, onOpenSettings }: Props) {
  const { detectedEditors, isScanning, scan } = useExternalEditors();
  const preferredEditorId = usePreferencesStore((s) => s.preferredEditorId);
  const customEditors = usePreferencesStore((s) => s.customEditors);
  const [open, setOpen] = useState(false);

  // Trigger a lazy scan the first time the dropdown is opened and no editors
  // have been detected yet.
  useEffect(() => {
    if (open && detectedEditors.length === 0 && !isScanning) {
      scan();
    }
  }, [open, detectedEditors.length, isScanning, scan]);

  const allEditors: AnyEditor[] = [...detectedEditors, ...customEditors];

  const preferredEditor =
    allEditors.find((e) => e.id === preferredEditorId) ?? allEditors[0] ?? null;

  const handleLaunch = useCallback(
    async (editor: AnyEditor) => {
      if (!target) return;
      void setPreferredEditorId(editor.id);
      const err = await openWithEditor(editor.binary, editor.argsBeforePath, target.path);
      if (err) {
        toast.error(`Could not open in ${editor.name}: ${err}`);
      }
    },
    [target],
  );

  const handleDirectClick = useCallback(() => {
    if (!preferredEditor || !target) return;
    void handleLaunch(preferredEditor);
  }, [preferredEditor, target, handleLaunch]);

  const disabled = !target;

  return (
    <div
      className={cn(
        "flex items-center rounded-md transition-opacity",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {/* Primary click area: icon + label */}
      <button
        type="button"
        title={target ? `Open in ${preferredEditor?.name ?? "editor"}: ${target.path}` : "No active panel"}
        onClick={handleDirectClick}
        disabled={disabled || !preferredEditor}
        className="flex h-7 items-center gap-1.5 rounded-l-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-100"
      >
        {preferredEditor ? (
          <EditorIcon id={preferredEditor.id} />
        ) : (
          <HugeiconsIcon icon={DocumentCodeIcon} size={14} strokeWidth={1.75} />
        )}
        {target && (
          <span className="max-w-[100px] truncate text-[11px]">
            {pathLabel(target)}
          </span>
        )}
      </button>

      {/* Dropdown trigger */}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="flex h-7 items-center rounded-r-md px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-100"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 text-[12px]">
          {allEditors.length === 0 && !isScanning && (
            <>
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                No editors detected
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onOpenSettings?.()}>
                Open External Editors settings
              </DropdownMenuItem>
            </>
          )}
          {isScanning && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
              Scanning...
            </div>
          )}
          {allEditors.map((editor) => (
            <DropdownMenuItem
              key={editor.id}
              onSelect={() => void handleLaunch(editor)}
              className="gap-2"
            >
              <EditorIcon id={editor.id} />
              <span className="flex-1">{editor.name}</span>
              {editor.id === preferredEditorId && (
                <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} className="text-muted-foreground" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

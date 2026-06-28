import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentCodeIcon, ArrowDown01Icon, Settings01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setPreferredEditorId,
} from "@/modules/settings/store";
import { useExternalEditors, openWithEditor } from "./useExternalEditors";
import type { AnyEditor } from "./types";
import { EditorIcon } from "./EditorIcon";
import { getEditorTargetType } from "./catalog";
import { toast } from "sonner";

export interface OpenInEditorTarget {
  path: string;
  kind: "file" | "dir";
}

interface Props {
  target: OpenInEditorTarget | null;
  workspaceRoot: string | null;
  onOpenSettings?: () => void;
}

function pathLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function resolveEditorTargetType(editor: AnyEditor): "file" | "workspace" {
  if ("targetKind" in editor && editor.targetKind) return editor.targetKind;
  return getEditorTargetType(editor.id);
}

function resolveEffectiveTarget(
  editor: AnyEditor,
  target: OpenInEditorTarget | null,
  workspaceRoot: string | null,
): OpenInEditorTarget | null {
  if (resolveEditorTargetType(editor) === "workspace") {
    return workspaceRoot ? { path: workspaceRoot, kind: "dir" } : null;
  }
  return target;
}

export function OpenInEditorButton({ target, workspaceRoot, onOpenSettings }: Props) {
  const { detectedEditors, isScanning } = useExternalEditors();
  const preferredEditorId = usePreferencesStore((s) => s.preferredEditorId);
  const customEditors = usePreferencesStore((s) => s.customEditors);
  const disabledDetectedEditorIds = usePreferencesStore((s) => s.disabledDetectedEditorIds);
  const [open, setOpen] = useState(false);

  // Only show editors that have both name and binary set, excluding user-disabled detected editors
  const allEditors: AnyEditor[] = [
    ...detectedEditors.filter((e) => !disabledDetectedEditorIds.includes(e.id)),
    ...customEditors,
  ].filter((e) => e.name.trim() && e.binary.trim());

  const preferredEditor =
    allEditors.find((e) => e.id === preferredEditorId) ?? allEditors[0] ?? null;

  const effectiveTarget = preferredEditor
    ? resolveEffectiveTarget(preferredEditor, target, workspaceRoot)
    : target;

  const handleSetPreferred = useCallback((editor: AnyEditor) => {
    void setPreferredEditorId(editor.id);
  }, []);

  const handleDirectClick = useCallback(async () => {
    if (!preferredEditor || !effectiveTarget) return;
    const err = await openWithEditor(preferredEditor.binary, preferredEditor.argsBeforePath, effectiveTarget.path);
    if (err) {
      toast.error(`Could not open in ${preferredEditor.name}: ${err}`);
    }
  }, [preferredEditor, effectiveTarget]);

  const disabled = !effectiveTarget;

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
        title={effectiveTarget ? `Open in ${preferredEditor?.name ?? "editor"}: ${effectiveTarget.path}` : "No active panel"}
        onClick={() => void handleDirectClick()}
        disabled={disabled || !preferredEditor}
        className="flex h-7 items-center gap-1.5 rounded-l-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-100"
      >
        {preferredEditor ? (
          <EditorIcon id={preferredEditor.id} size={16} />
        ) : (
          <HugeiconsIcon icon={DocumentCodeIcon} size={16} strokeWidth={1.75} />
        )}
        {effectiveTarget && (
          <span className="max-w-[100px] truncate text-[11px]">
            {pathLabel(effectiveTarget.path)}
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
          {isScanning && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
              Scanning...
            </div>
          )}
          {!isScanning && allEditors.length === 0 && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
              No editors detected
            </div>
          )}
          {allEditors.map((editor) => (
            <DropdownMenuItem
              key={editor.id}
              onSelect={() => handleSetPreferred(editor)}
              className="gap-2"
            >
              <EditorIcon id={editor.id} size={16} />
              <span className="flex-1">{editor.name}</span>
              {editor.id === (preferredEditorId ?? allEditors[0]?.id) && (
                <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} className="text-muted-foreground" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onOpenSettings?.()} className="gap-2 text-muted-foreground">
            <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={1.75} />
            Configure editors
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

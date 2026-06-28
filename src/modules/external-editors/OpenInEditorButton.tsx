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
  setPreferredFileEditorId,
  setPreferredWorkspaceEditorId,
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

export function OpenInEditorButton({ target, workspaceRoot, onOpenSettings }: Props) {
  const { detectedEditors, isScanning } = useExternalEditors();
  const preferredFileEditorId = usePreferencesStore((s) => s.preferredFileEditorId);
  const preferredWorkspaceEditorId = usePreferencesStore((s) => s.preferredWorkspaceEditorId);
  const customEditors = usePreferencesStore((s) => s.customEditors);
  const disabledDetectedEditorIds = usePreferencesStore((s) => s.disabledDetectedEditorIds);
  const [open, setOpen] = useState(false);

  const allEditors: AnyEditor[] = [
    ...detectedEditors.filter((e) => !disabledDetectedEditorIds.includes(e.id)),
    ...customEditors,
  ].filter((e) => e.name.trim() && e.binary.trim());

  const hasFile = target?.kind === "file";
  const hasWorkspace = !!workspaceRoot;

  // File editors only shown when a file is active; workspace editors only when workspace root exists
  const fileEditors = hasFile
    ? allEditors.filter((e) => resolveEditorTargetType(e) === "file")
    : [];
  const workspaceEditors = hasWorkspace
    ? allEditors.filter((e) => resolveEditorTargetType(e) === "workspace")
    : [];

  const anyAvailable = fileEditors.length > 0 || workspaceEditors.length > 0;

  // Active preferred editor per type (falls back to first available)
  const activeFileEditor =
    fileEditors.find((e) => e.id === preferredFileEditorId) ?? fileEditors[0] ?? null;
  const activeWorkspaceEditor =
    workspaceEditors.find((e) => e.id === preferredWorkspaceEditorId) ?? workspaceEditors[0] ?? null;

  // Primary button editor:
  // - Preferred file editor when a file is selected and one is set
  // - Workspace editor otherwise (always available when workspace root exists)
  const primaryEditor: AnyEditor | null =
    hasFile && preferredFileEditorId && activeFileEditor
      ? activeFileEditor
      : activeWorkspaceEditor ?? activeFileEditor;

  const primaryTarget: OpenInEditorTarget | null = (() => {
    if (!primaryEditor) return hasFile ? target : null;
    if (resolveEditorTargetType(primaryEditor) === "workspace") {
      return workspaceRoot ? { path: workspaceRoot, kind: "dir" } : null;
    }
    return target;
  })();

  const disabled = !anyAvailable || !primaryTarget;

  const handleDirectClick = useCallback(async () => {
    if (!primaryEditor || !primaryTarget) return;
    const err = await openWithEditor(
      primaryEditor.binary,
      primaryEditor.argsBeforePath,
      primaryTarget.path,
    );
    if (err) toast.error(`Could not open in ${primaryEditor.name}: ${err}`);
  }, [primaryEditor, primaryTarget]);

  const handleOpenWith = useCallback(
    async (editor: AnyEditor) => {
      const editorTarget =
        resolveEditorTargetType(editor) === "workspace"
          ? workspaceRoot
            ? { path: workspaceRoot, kind: "dir" as const }
            : null
          : target;
      if (!editorTarget) return;
      const err = await openWithEditor(editor.binary, editor.argsBeforePath, editorTarget.path);
      if (err) toast.error(`Could not open in ${editor.name}: ${err}`);
    },
    [target, workspaceRoot],
  );

  const handleSetPreferred = useCallback((editor: AnyEditor) => {
    if (resolveEditorTargetType(editor) === "workspace") {
      void setPreferredWorkspaceEditorId(editor.id);
    } else {
      void setPreferredFileEditorId(editor.id);
    }
  }, []);

  return (
    <div
      className={cn(
        "flex items-center rounded-md transition-opacity",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {/* Primary click: icon + path label */}
      <button
        type="button"
        title={
          primaryTarget
            ? `Open in ${primaryEditor?.name ?? "editor"}: ${primaryTarget.path}`
            : "No active panel"
        }
        onClick={() => void handleDirectClick()}
        disabled={disabled || !primaryEditor}
        className="flex h-7 items-center gap-1.5 rounded-l-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-100"
      >
        {primaryEditor ? (
          <EditorIcon id={primaryEditor.id} size={16} />
        ) : (
          <HugeiconsIcon icon={DocumentCodeIcon} size={16} strokeWidth={1.75} />
        )}
        {primaryTarget && (
          <span className="max-w-[100px] truncate text-[11px]">
            {pathLabel(primaryTarget.path)}
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
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Scanning...</div>
          )}

          {/* File editors — only visible when a file is active */}
          {fileEditors.map((editor) => (
            <DropdownMenuItem
              key={editor.id}
              onSelect={() => {
                handleSetPreferred(editor);
                void handleOpenWith(editor);
              }}
              className="gap-2"
            >
              <EditorIcon id={editor.id} size={16} />
              <span className="flex-1">{editor.name}</span>
              {editor.id === (preferredFileEditorId ?? fileEditors[0]?.id) && (
                <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} className="text-muted-foreground" />
              )}
            </DropdownMenuItem>
          ))}

          {/* Workspace editors — only visible when workspace root exists */}
          {workspaceEditors.length > 0 && fileEditors.length > 0 && (
            <DropdownMenuSeparator />
          )}
          {workspaceEditors.map((editor) => (
            <DropdownMenuItem
              key={editor.id}
              onSelect={() => {
                handleSetPreferred(editor);
                void handleOpenWith(editor);
              }}
              className="gap-2"
            >
              <EditorIcon id={editor.id} size={16} />
              <span className="flex-1">{editor.name}</span>
              {editor.id === (preferredWorkspaceEditorId ?? workspaceEditors[0]?.id) && (
                <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} className="text-muted-foreground" />
              )}
            </DropdownMenuItem>
          ))}

          {!isScanning && fileEditors.length === 0 && workspaceEditors.length === 0 && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
              No editors detected
            </div>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => onOpenSettings?.()}
            className="gap-2 text-muted-foreground"
          >
            <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={1.75} />
            Configure editors
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

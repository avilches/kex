import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { getEditorTargetType, isTextEditorGroup } from "./catalog";
import { toast } from "sonner";

export interface OpenInEditorTarget {
  path: string;
  kind: "file" | "dir";
}

interface Props {
  target: OpenInEditorTarget | null;
  workspaceRoot: string | null;
  onOpenSettings?: () => void;
  onSetWorkspaceRoot?: () => void;
}

function pathLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function OpenInEditorButton({ target, workspaceRoot, onOpenSettings, onSetWorkspaceRoot }: Props) {
  const { detectedEditors, isScanning } = useExternalEditors();
  const preferredFileEditorId = usePreferencesStore((s) => s.preferredFileEditorId);
  const preferredWorkspaceEditorId = usePreferencesStore((s) => s.preferredWorkspaceEditorId);
  const textEditorMode = usePreferencesStore((s) => s.textEditorMode);
  const customEditors = usePreferencesStore((s) => s.customEditors);
  const [open, setOpen] = useState(false);
  // Last editor explicitly chosen from the dropdown; takes priority over auto-selection.
  // Cleared when the context type changes (file <-> dir) so auto-selection resumes.
  const [overrideEditorId, setOverrideEditorId] = useState<string | null>(null);

  const allEditors: AnyEditor[] = [
    ...detectedEditors.filter((e) => e.enabled !== false),
    ...customEditors,
  ].filter((e) => e.name.trim() && e.binary.trim());

  const hasFile = target?.kind === "file";

  // Custom editors with "workspace-and-files" or text editors in "workspace-and-files" mode:
  // open the file when one is active, workspace root when navigating a directory.
  // Text editors in "file-only" mode only open individual files (never workspace root).
  function resolveEditorEffectiveType(editor: AnyEditor): "file" | "workspace" {
    if ("targetKind" in editor && editor.targetKind) {
      if (editor.targetKind === "workspace-and-files") return hasFile ? "file" : "workspace";
      return editor.targetKind;
    }
    const catalogType = getEditorTargetType(editor.id);
    if (catalogType === "file" && isTextEditorGroup(editor.id)) {
      if (textEditorMode === "workspace-and-files") return hasFile ? "file" : "workspace";
      return "file"; // "file-only": always open the file, never workspace root
    }
    return catalogType;
  }

  const currentFolderPath: string | null = (() => {
    if (!target) return null;
    if (target.kind === "dir") return target.path;
    const parts = target.path.split(/[\\/]/);
    parts.pop();
    return parts.join("/") || null;
  })();

  const contextType: "file" | "dir" | "none" = hasFile ? "file" : currentFolderPath ? "dir" : "none";

  // Clear the override whenever the context type flips so auto-selection resumes.
  useEffect(() => {
    setOverrideEditorId(null);
  }, [contextType]);

  // File editors shown only when a file is active; workspace editors when a root exists.
  const fileEditors = hasFile
    ? allEditors.filter((e) => resolveEditorEffectiveType(e) === "file")
    : [];
  const workspaceEditors = workspaceRoot
    ? allEditors.filter((e) => resolveEditorEffectiveType(e) === "workspace")
    : [];

  const anyAvailable = fileEditors.length > 0 || workspaceEditors.length > 0;

  const activeFileEditor =
    fileEditors.find((e) => e.id === preferredFileEditorId) ?? fileEditors[0] ?? null;
  const activeWorkspaceEditor =
    workspaceEditors.find((e) => e.id === preferredWorkspaceEditorId) ??
    workspaceEditors[0] ??
    null;

  // Primary editor: explicit override wins; otherwise file tab gets file editor
  // (falling back to workspace editor when none available), dir tab gets workspace editor.
  const primaryEditor: AnyEditor | null = (() => {
    if (overrideEditorId) {
      const found = allEditors.find((e) => e.id === overrideEditorId);
      if (found) return found;
    }
    if (hasFile) return activeFileEditor ?? activeWorkspaceEditor;
    return activeWorkspaceEditor;
  })();

  const primaryTarget: OpenInEditorTarget | null = (() => {
    if (!primaryEditor) return null;
    const type = resolveEditorEffectiveType(primaryEditor);
    if (type === "workspace") return workspaceRoot ? { path: workspaceRoot, kind: "dir" } : null;
    return hasFile ? target : null;
  })();

  const leftDisabled = !anyAvailable || !primaryTarget;
  const noTools = !anyAvailable && !isScanning;

  const handleDirectClick = useCallback(async () => {
    if (!primaryEditor || !primaryTarget) return;
    const err = await openWithEditor(
      primaryEditor.binary,
      primaryEditor.argsBeforePath,
      primaryTarget.path,
    );
    if (err) toast.error(`Could not open in ${primaryEditor.name}: ${err}`);
  }, [primaryEditor, primaryTarget]);

  // Dropdown only sets the preference for the selected category; does not execute.
  const handleSetPreferred = useCallback((editor: AnyEditor) => {
    setOverrideEditorId(editor.id);
    const type = resolveEditorEffectiveType(editor);
    if (type === "file") {
      usePreferencesStore.setState({ preferredFileEditorId: editor.id });
      void setPreferredFileEditorId(editor.id);
    } else {
      usePreferencesStore.setState({ preferredWorkspaceEditorId: editor.id });
      void setPreferredWorkspaceEditorId(editor.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textEditorMode, hasFile]);

  if (noTools) {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon icon={DocumentCodeIcon} size={16} strokeWidth={1.75} />
            <span>Open in</span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 text-[12px]">
          {!hasFile && !workspaceRoot ? (
            <DropdownMenuItem
              onSelect={() => onSetWorkspaceRoot?.()}
              className="gap-2 text-muted-foreground"
            >
              Set workspace root
            </DropdownMenuItem>
          ) : (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No tools selected</div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => onOpenSettings?.()}
            className="gap-2 text-muted-foreground"
          >
            <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={1.75} />
            Configure Tools
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex items-center rounded-md">
      <button
        type="button"
        title={
          primaryTarget
            ? `Open in ${primaryEditor?.name ?? "editor"}: ${primaryTarget.path}`
            : "No active panel"
        }
        onClick={() => void handleDirectClick()}
        disabled={leftDisabled}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-l-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          leftDisabled && "cursor-default opacity-40",
        )}
      >
        {primaryEditor ? (
          <EditorIcon id={primaryEditor.id} size={16} />
        ) : (
          <HugeiconsIcon icon={DocumentCodeIcon} size={16} strokeWidth={1.75} />
        )}
        {primaryEditor && (
          <span className="truncate text-[11px]">{primaryEditor.name}</span>
        )}
        {primaryTarget && (
          <span className="max-w-[80px] truncate text-[11px] text-muted-foreground/60">
            {pathLabel(primaryTarget.path)}
          </span>
        )}
      </button>

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 items-center rounded-r-md px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 text-[12px]">
          {isScanning && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Scanning...</div>
          )}

          {fileEditors.length > 0 && (
            <>
              <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Edit files
              </DropdownMenuLabel>
              {fileEditors.map((editor) => (
                <DropdownMenuItem
                  key={editor.id}
                  onSelect={() => handleSetPreferred(editor)}
                  className="gap-2"
                >
                  <EditorIcon id={editor.id} size={16} />
                  <span className="flex-1">{editor.name}</span>
                  {editor.id === activeFileEditor?.id && (
                    <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} className="text-muted-foreground" />
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}

          {workspaceEditors.length > 0 && (
            <>
              {fileEditors.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Workspace root
              </DropdownMenuLabel>
              {workspaceEditors.map((editor) => (
                <DropdownMenuItem
                  key={editor.id}
                  onSelect={() => handleSetPreferred(editor)}
                  className="gap-2"
                >
                  <EditorIcon id={editor.id} size={16} />
                  <span className="flex-1">{editor.name}</span>
                  {editor.id === activeWorkspaceEditor?.id && (
                    <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} className="text-muted-foreground" />
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}

          {!isScanning && !anyAvailable && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
              {!hasFile && !workspaceRoot
                ? "Please set a Workspace Root"
                : "No tools selected"}
            </div>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => onOpenSettings?.()}
            className="gap-2 text-muted-foreground"
          >
            <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={1.75} />
            Configure Tools
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

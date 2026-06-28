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
  setPreferredTerminalEditorId,
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

function resolveEditorTargetType(editor: AnyEditor): "file" | "workspace" | "terminal" {
  if ("targetKind" in editor && editor.targetKind) return editor.targetKind;
  return getEditorTargetType(editor.id);
}

export function OpenInEditorButton({ target, workspaceRoot, onOpenSettings }: Props) {
  const { detectedEditors, isScanning } = useExternalEditors();
  const preferredFileEditorId = usePreferencesStore((s) => s.preferredFileEditorId);
  const preferredWorkspaceEditorId = usePreferencesStore((s) => s.preferredWorkspaceEditorId);
  const preferredTerminalEditorId = usePreferencesStore((s) => s.preferredTerminalEditorId);
  const customEditors = usePreferencesStore((s) => s.customEditors);
  const disabledDetectedEditorIds = usePreferencesStore((s) => s.disabledDetectedEditorIds);
  const [open, setOpen] = useState(false);
  // Last editor explicitly chosen from the dropdown; takes priority over auto-selection.
  // Cleared when the context type changes (file <-> dir) so auto-selection resumes.
  const [overrideEditorId, setOverrideEditorId] = useState<string | null>(null);

  const allEditors: AnyEditor[] = [
    ...detectedEditors.filter((e) => !disabledDetectedEditorIds.includes(e.id)),
    ...customEditors,
  ].filter((e) => e.name.trim() && e.binary.trim());

  const hasFile = target?.kind === "file";

  const currentFolderPath: string | null = (() => {
    if (!target) return null;
    if (target.kind === "dir") return target.path;
    const parts = target.path.split(/[\\/]/);
    parts.pop();
    return parts.join("/") || null;
  })();

  // Whether the active tab is a dir context (terminal CWD, git-diff root, etc.)
  const isTerminalContext = !hasFile && !!currentFolderPath;

  // Terminal CWD is inside the workspace root: prefer workspace editors over terminal apps.
  const terminalInsideWorkspace =
    isTerminalContext &&
    !!workspaceRoot &&
    !!currentFolderPath &&
    (currentFolderPath === workspaceRoot ||
      currentFolderPath.startsWith(workspaceRoot + "/") ||
      currentFolderPath.startsWith(workspaceRoot + "\\"));

  // Clear the override whenever the context type flips (file <-> dir) so the
  // appropriate auto-selection takes effect without the user needing to re-pick.
  const contextType: "file" | "dir" | "none" = hasFile ? "file" : isTerminalContext ? "dir" : "none";
  useEffect(() => {
    setOverrideEditorId(null);
  }, [contextType]);

  // Editors by type — dropdown sections are gated on context:
  // - "Edit files" only when a file is active
  // - "Workspace root" whenever a workspace root exists
  // - "Terminals" whenever there is any folder context
  const fileEditors = hasFile
    ? allEditors.filter((e) => resolveEditorTargetType(e) === "file")
    : [];
  const workspaceEditors = workspaceRoot
    ? allEditors.filter((e) => resolveEditorTargetType(e) === "workspace")
    : [];
  const terminalEditors = currentFolderPath
    ? allEditors.filter((e) => resolveEditorTargetType(e) === "terminal")
    : [];

  const anyAvailable =
    fileEditors.length > 0 || workspaceEditors.length > 0 || terminalEditors.length > 0;

  // Per-category preferred editor (each has its own saved preference slot)
  const activeFileEditor =
    fileEditors.find((e) => e.id === preferredFileEditorId) ?? fileEditors[0] ?? null;
  const activeWorkspaceEditor =
    workspaceEditors.find((e) => e.id === preferredWorkspaceEditorId) ??
    workspaceEditors[0] ??
    null;
  const activeTerminalEditor =
    terminalEditors.find((e) => e.id === preferredTerminalEditorId) ??
    terminalEditors[0] ??
    null;

  // Primary editor selection:
  //   - Explicit dropdown pick (override) always wins while context matches.
  //   - File tab: prefer file editors.
  //   - Dir tab inside workspace: prefer workspace editors, fall back to terminal.
  //   - Dir tab outside workspace (or no workspace root): prefer terminal editors, fall back to workspace.
  const primaryEditor: AnyEditor | null = (() => {
    if (overrideEditorId) {
      const found = allEditors.find((e) => e.id === overrideEditorId);
      if (found) return found;
    }
    if (hasFile) return activeFileEditor;
    if (terminalInsideWorkspace) return activeWorkspaceEditor ?? activeTerminalEditor ?? null;
    if (isTerminalContext) return activeTerminalEditor ?? activeWorkspaceEditor ?? null;
    return null;
  })();

  const primaryTarget: OpenInEditorTarget | null = (() => {
    if (!primaryEditor) return null;
    const type = resolveEditorTargetType(primaryEditor);
    if (type === "workspace") return workspaceRoot ? { path: workspaceRoot, kind: "dir" } : null;
    if (type === "terminal") return currentFolderPath ? { path: currentFolderPath, kind: "dir" } : null;
    return hasFile ? target : null;
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

  // Dropdown only sets the preference for the selected type; does not execute.
  // Each category has its own preference slot so switching context restores the
  // right default per type.
  const handleSetPreferred = useCallback((editor: AnyEditor) => {
    setOverrideEditorId(editor.id);
    const type = resolveEditorTargetType(editor);
    if (type === "file") {
      usePreferencesStore.setState({ preferredFileEditorId: editor.id });
      void setPreferredFileEditorId(editor.id);
    } else if (type === "workspace") {
      usePreferencesStore.setState({ preferredWorkspaceEditorId: editor.id });
      void setPreferredWorkspaceEditorId(editor.id);
    } else {
      usePreferencesStore.setState({ preferredTerminalEditorId: editor.id });
      void setPreferredTerminalEditorId(editor.id);
    }
  }, []);

  return (
    <div
      className={cn(
        "flex items-center rounded-md transition-opacity",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {/* Primary click: icon + editor name + path label */}
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
        {primaryEditor && (
          <span className="truncate text-[11px]">{primaryEditor.name}</span>
        )}
        {primaryTarget && (
          <span className="max-w-[80px] truncate text-[11px] text-muted-foreground/60">
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

          {/* Edit files — only when a file is active */}
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

          {/* Workspace root — when a workspace root exists */}
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

          {/* Terminals — whenever there is any folder context */}
          {terminalEditors.length > 0 && (
            <>
              {(fileEditors.length > 0 || workspaceEditors.length > 0) && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Terminals
              </DropdownMenuLabel>
              {terminalEditors.map((editor) => (
                <DropdownMenuItem
                  key={editor.id}
                  onSelect={() => handleSetPreferred(editor)}
                  className="gap-2"
                >
                  <EditorIcon id={editor.id} size={16} />
                  <span className="flex-1">{editor.name}</span>
                  {editor.id === activeTerminalEditor?.id && (
                    <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} className="text-muted-foreground" />
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}

          {!isScanning && !anyAvailable && (
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
            Configure Tools
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

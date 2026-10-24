import { useEffect, useRef, useState } from "react";
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
import { normalizeRootPath, toForwardSlashes } from "@/lib/pathUtils";
import { RenameTemplates } from "@/modules/workspaces/RenameTemplates";
import { useWorkspaceSettingsStore, type WorkspaceSettingsFocus, type WorkspaceSettingsSection } from "@/modules/workspaces/lib/workspaceSettingsStore";
import { DialogScrollHost } from "@/components/dialogScrollHost";
import {
  resolveWorkspaceColor,
} from "@/modules/workspaces/lib/workspaceColor";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { focusedTab } from "@/modules/workspaces/lib/splitNode";
import { clearTitleDraft, setTitleDraft } from "@/modules/workspaces/lib/titleDraftStore";
import { IconPaletteGrid } from "@/modules/workspaces/IconPaletteGrid";
import { ColorPaletteGrid } from "@/modules/workspaces/ColorPaletteGrid";
import { useWorkspaceTitle } from "@/modules/workspaces/lib/workspaceTitle";
import { INPUT_CLASS } from "@/settings/components/inputClass";

function WorkspaceHeading({ ws }: { ws: Workspace | undefined }) {
  const shown = useWorkspaceTitle({
    id: ws?.id,
    title: ws?.title ?? "",
    cwd: ws?.cwd,
    workspaceRoot: ws?.workspaceRoot,
    focusedTab: ws ? focusedTab(ws.paneTree, ws.activePaneId) : null,
  });
  return <>Workspace {ws ? shown : ""}</>;
}

type Props = {
  workspaces: Workspace[];
  onSetTitle: (id: string, title: string) => void;
  onSetColor: (id: string, color: string | null) => void;
  onSetIcon: (id: string, icon: string | null) => void;
  onSetWorkspaceRoot: (id: string, path: string | undefined) => void;
  onRestoreFocus: () => void;
};

export function WorkspaceSettingsDialog(props: Props) {
  const { open, workspaceId, initialSection, initialFocus, closeSettings } = useWorkspaceSettingsStore();
  const ws = props.workspaces.find((w) => w.id === workspaceId);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);

  function handleClose() {
    closeSettings();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        ref={setContentEl}
        className="max-h-[calc(100vh-2rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto overflow-x-hidden sm:max-w-xl"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          props.onRestoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle><WorkspaceHeading ws={ws} /></DialogTitle>
        </DialogHeader>
        {ws && (
          <DialogScrollHost content={contentEl}>
            <WorkspaceSettingsForm
              key={`${ws.id}-${initialSection}-${initialFocus}`}
              ws={ws}
              initialSection={initialSection}
              initialFocus={initialFocus}
              onRequestClose={handleClose}
              {...props}
            />
          </DialogScrollHost>
        )}
      </DialogContent>
    </Dialog>
  );
}


function ColorPicker({
  wsId,
  wsColor,
  displayColor,
  onSetColor,
}: {
  wsId: string;
  wsColor: string | null | undefined;
  displayColor: string | null;
  onSetColor: (id: string, color: string | null) => void;
}) {
  return (
    <ColorPaletteGrid
      layout="row"
      value={wsColor}
      displayColor={displayColor}
      noneSelected={wsColor === null}
      onSelect={(color) => onSetColor(wsId, color)}
    />
  );
}

type FormProps = { ws: Workspace; initialSection: WorkspaceSettingsSection; initialFocus: WorkspaceSettingsFocus; onRequestClose: () => void } & Omit<Props, "workspaces">;

function WorkspaceSettingsForm({ ws, initialFocus, onRequestClose, ...props }: FormProps) {
  const [cwdValue, setCwdValue] = useState(ws.workspaceRoot ?? "");
  const [cwdValid, setCwdValid] = useState<boolean | null>(null);
  const [titleValue, setTitleValue] = useState(ws.title ?? "");
  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => clearTitleDraft(ws.id), [ws.id]);
  const cwdInputRef = useRef<HTMLInputElement>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (initialFocus === "workspaceRoot") {
        cwdInputRef.current?.focus();
      } else {
        nameInputRef.current?.focus();
      }
    }, 0);
    return () => clearTimeout(t);
  }, [initialFocus]);

  useEffect(() => {
    if (!cwdValue) {
      setCwdValid(null);
      return;
    }
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const stat = await native.fsStat(cwdValue);
        if (!stale) setCwdValid(stat.kind === "dir");
      } catch {
        if (!stale) setCwdValid(false);
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [cwdValue]);

  const displayColor = resolveWorkspaceColor(ws.color, ws.id);

  return (
    <div className="flex min-h-[380px] min-w-0 flex-col gap-0 py-1">
        <div className="flex flex-col gap-5">
          {/* Name: full width */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="workspace-title" className="text-xs font-medium">Name</label>
            <input
              id="workspace-title"
              ref={nameInputRef}
              className={INPUT_CLASS}
              placeholder="Name (empty uses the default title)"
              spellCheck={false}
              value={titleValue}
              onChange={(e) => {
                setTitleValue(e.target.value);
                setTitleDraft(ws.id, e.target.value);
                // An empty name (back to the default title) is saved on blur, not mid-typing.
                if (e.target.value.trim()) props.onSetTitle(ws.id, e.target.value.trim());
              }}
              onBlur={(e) => {
                props.onSetTitle(ws.id, e.target.value.trim());
                clearTitleDraft(ws.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); cwdInputRef.current?.focus(); }
              }}
            />
            <RenameTemplates
              open={templatesOpen}
              onToggle={() => setTemplatesOpen((o) => !o)}
              subject="workspace"
              listClassName="max-h-44 overflow-y-auto"
              tab={focusedTab(ws.paneTree, ws.activePaneId)}
              workspace={{ id: ws.id, cwd: ws.cwd, workspaceRoot: ws.workspaceRoot }}
              getInput={() => nameInputRef.current}
              onInserted={(value) => {
                setTitleValue(value);
                setTitleDraft(ws.id, value);
              }}
            />
          </div>

          {/* Working Directory */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="workspace-root" className="text-xs font-medium">Workspace Root</label>
            <div className="flex items-center gap-1">
              <input
                id="workspace-root"
                ref={cwdInputRef}
                className={cn(
                  INPUT_CLASS,
                  "flex-1",
                  cwdValid === false && "border-destructive",
                )}
                spellCheck={false}
                value={cwdValue}
                onChange={(e) => setCwdValue(e.target.value)}
                onBlur={() => {
                  const normalized = normalizeRootPath(cwdValue);
                  if (normalized !== cwdValue) setCwdValue(normalized);
                  if (!normalized) {
                    props.onSetWorkspaceRoot(ws.id, undefined);
                  } else if (cwdValid !== false) {
                    props.onSetWorkspaceRoot(ws.id, normalized);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onRequestClose(); }
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
                    props.onSetWorkspaceRoot(ws.id, undefined);
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
                    const normalized = toForwardSlashes(selected);
                    setCwdValue(normalized);
                    setCwdValid(null);
                    props.onSetWorkspaceRoot(ws.id, normalized);
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
            <p className="text-[11px] text-muted-foreground/60">
              Tip: right-click any folder in the explorer and choose &quot;Set as Workspace Root&quot;
            </p>
          </div>

          {/* Color */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Color</span>
            <ColorPicker
              wsId={ws.id}
              wsColor={ws.color}
              displayColor={displayColor}
              onSetColor={props.onSetColor}
            />
          </div>

          {/* Icon */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Icon</span>
            <IconPaletteGrid
              layout="inline"
              value={ws.icon}
              onSelect={(icon) => props.onSetIcon(ws.id, icon)}
            />
          </div>
        </div>
    </div>
  );
}

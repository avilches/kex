import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setShortcuts } from "@/modules/settings/store";
import {
  bindingsEqual,
  getBindingTokens,
  SHORTCUTS,
  SHORTCUT_GROUPS,
  type KeyBinding,
  type Shortcut,
  type ShortcutId,
} from "@/modules/shortcuts/shortcuts";
import {
  ArrowTurnBackwardIcon,
  CancelCircleIcon,
  Refresh01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState, useMemo } from "react";
import { SectionHeader } from "../components/SectionHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ShortcutsSection() {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const [search, setSearch] = useState("");
  const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);
  const [recordingConflict, setRecordingConflict] = useState<{ binding: KeyBinding; with: Shortcut } | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const startRecording = (id: ShortcutId) => {
    setRecordingId(id);
    setRecordingConflict(null);
  };

  const stopRecording = () => {
    setRecordingId(null);
    setRecordingConflict(null);
  };

  const filteredShortcuts = useMemo(() => {
    // Filter out internal/non-overridable shortcuts (JSON-only).
    const HIDDEN_IDS = new Set(["tab.selectByIndex"]);
    const base = SHORTCUTS.filter((s) => !HIDDEN_IDS.has(s.id));
    if (!search) return base;
    const lower = search.toLowerCase();
    return base.filter(
      (s) =>
        s.label.toLowerCase().includes(lower) ||
        s.group.toLowerCase().includes(lower)
    );
  }, [search]);

  const onRecord = (id: ShortcutId, binding: KeyBinding) => {
    const next = { ...userShortcuts, [id]: [binding] };
    void setShortcuts(next);
    stopRecording();
  };

  const onClear = (id: ShortcutId) => {
    const next = { ...userShortcuts, [id]: [] };
    void setShortcuts(next);
  };

  const onResetShortcut = (id: ShortcutId) => {
    const next = { ...userShortcuts };
    delete next[id];
    void setShortcuts(next);
  };

  const onResetAll = () => {
    void setShortcuts({});
    setResetDialogOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Shortcuts" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-[11px]"
          onClick={() => setResetDialogOpen(true)}
        >
          <HugeiconsIcon
            icon={ArrowTurnBackwardIcon}
            size={12}
            strokeWidth={2}
          />
          Reset All
        </Button>
      </div>

      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          size={14}
          strokeWidth={2}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search shortcuts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-9 text-[12.5px]"
        />
      </div>

      <div className="flex flex-col gap-8">
        {SHORTCUT_GROUPS.map((group) => {
          const items = filteredShortcuts.filter((s) => s.group === group);
          if (items.length === 0) return null;

          return (
            <div key={group} className="flex flex-col gap-3">
              <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {group}
              </h3>
              <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/60 bg-card/40 overflow-hidden">
                {items.map((s) => (
                  <ShortcutRow
                    key={s.id}
                    shortcut={s}
                    isRecording={recordingId === s.id}
                    conflict={recordingId === s.id ? recordingConflict : null}
                    onConflict={setRecordingConflict}
                    onStartRecording={() => startRecording(s.id)}
                    onStopRecording={stopRecording}
                    onRecord={(b) => onRecord(s.id, b)}
                    onClear={() => onClear(s.id)}
                    onReset={() => onResetShortcut(s.id)}
                    userBindings={userShortcuts[s.id]}
                    userShortcuts={userShortcuts}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all shortcuts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert all your custom keyboard shortcuts to their
              factory defaults. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onResetAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ShortcutRow({
  shortcut,
  isRecording,
  conflict,
  onConflict,
  onStartRecording,
  onStopRecording,
  onRecord,
  onClear,
  onReset,
  userBindings,
  userShortcuts,
}: {
  shortcut: Shortcut;
  isRecording: boolean;
  conflict: { binding: KeyBinding; with: Shortcut } | null;
  onConflict: (c: { binding: KeyBinding; with: Shortcut } | null) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onRecord: (b: KeyBinding) => void;
  onClear: () => void;
  onReset: () => void;
  userBindings?: KeyBinding[];
  userShortcuts: Record<ShortcutId, KeyBinding[]>;
}) {
  const bindings =
    userBindings !== undefined ? userBindings : shortcut.defaultBindings;
  const isModified = userBindings !== undefined;
  const hasBindings = bindings && bindings.length > 0;

  return (
    <div className="group flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-muted/30">
      <div className="flex flex-col gap-0.5">
        <span className="text-[12.5px] font-medium">{shortcut.label}</span>
      </div>

      <div className="flex items-center gap-2">
        {isRecording ? (
          <Recorder
            currentId={shortcut.id}
            userShortcuts={userShortcuts}
            conflict={conflict}
            onConflict={onConflict}
            onRecord={onRecord}
            onCancel={onStopRecording}
          />
        ) : (
          <>
            <div
              onClick={onStartRecording}
              className="flex min-w-[100px] items-center justify-end gap-1"
            >
              {hasBindings ? (
                <KbdGroup>
                  {getBindingTokens(bindings[0]).map((t, i) => (
                    <Kbd
                      key={i}
                      className="group-hover:bg-accent group-hover:text-accent-foreground transition-colors"
                    >
                      {t}
                    </Kbd>
                  ))}
                </KbdGroup>
              ) : (
                <span className="text-[11px] text-muted-foreground italic">
                  Unassigned
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {!hasBindings && isModified ? (
                <ActionButton onClick={onReset} title="Reset to default">
                  <HugeiconsIcon icon={Refresh01Icon} size={11} />
                </ActionButton>
              ) : hasBindings ? (
                <ActionButton onClick={onClear} title="Clear shortcut">
                  <HugeiconsIcon icon={CancelCircleIcon} size={12} />
                </ActionButton>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function findConflict(
  binding: KeyBinding,
  currentId: ShortcutId,
  userShortcuts: Record<ShortcutId, KeyBinding[]>,
): Shortcut | null {
  for (const s of SHORTCUTS) {
    if (s.id === currentId) continue;
    const bindings = s.id in userShortcuts ? userShortcuts[s.id] : s.defaultBindings;
    if (bindings.some((b) => bindingsEqual(b, binding))) return s;
  }
  return null;
}

function ActionButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Recorder({
  currentId,
  userShortcuts,
  conflict,
  onConflict,
  onRecord,
  onCancel,
}: {
  currentId: ShortcutId;
  userShortcuts: Record<ShortcutId, KeyBinding[]>;
  conflict: { binding: KeyBinding; with: Shortcut } | null;
  onConflict: (c: { binding: KeyBinding; with: Shortcut } | null) => void;
  onRecord: (b: KeyBinding) => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        onCancel();
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [onCancel]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }

      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

      const hasPrimaryModifier = e.ctrlKey || e.altKey || e.metaKey;
      const isCharacterKey = e.key.length === 1;
      if (!hasPrimaryModifier && (!e.shiftKey || isCharacterKey)) return;

      e.preventDefault();
      e.stopPropagation();

      // On macOS, Option transforms alpha keys (e.g. Option+B → "∫"), so use
      // e.code to recover the actual key name when alt is held.
      const key = (e.altKey && /^Key[A-Z]$/.test(e.code))
        ? e.code.slice(3).toLowerCase()
        : e.key;
      const binding: KeyBinding = {
        key,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      };

      const conflicting = findConflict(binding, currentId, userShortcuts);
      if (conflicting) {
        onConflict({ binding, with: conflicting });
        return;
      }

      onConflict(null);
      onRecord(binding);
    };

    window.addEventListener("keydown", onDown, { capture: true });
    return () => window.removeEventListener("keydown", onDown, { capture: true });
  }, [currentId, userShortcuts, onConflict, onRecord, onCancel]);

  if (conflict) {
    return (
      <div ref={containerRef} className="flex items-center gap-2">
        <span className="text-[11px] text-destructive">
          Used by "{conflict.with.label}"
        </span>
        <div className="flex items-center gap-1 rounded bg-destructive/10 px-2 py-1 text-[11px] ring-1 ring-destructive/50">
          <KbdGroup>
            {getBindingTokens(conflict.binding).map((t, i) => (
              <Kbd key={i} className="border-destructive/60 text-destructive bg-destructive/10">
                {t}
              </Kbd>
            ))}
          </KbdGroup>
        </div>
        <ActionButton onClick={onCancel} title="Cancel">
          <HugeiconsIcon icon={CancelCircleIcon} size={12} />
        </ActionButton>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex items-center gap-2 rounded bg-accent/50 px-2 py-1 text-[11px] ring-1 ring-accent">
      <span className="animate-pulse font-medium">Recording...</span>
      <span className="text-muted-foreground">(Esc to cancel)</span>
    </div>
  );
}

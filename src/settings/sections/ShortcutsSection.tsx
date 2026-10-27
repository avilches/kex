import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setShortcuts } from "@/modules/settings/store";
import {
  bindingFromEvent,
  bindingsEqual,
  getBindingTokens,
  type KeyBinding,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type Shortcut,
  type ShortcutId,
  shortcutsForEvent,
} from "@/modules/shortcuts/shortcuts";
import {
  CancelCircleIcon,
  KeyboardIcon,
  Refresh01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";

export function ShortcutsSection() {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const [search, setSearch] = useState("");
  const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);
  const [recordingConflict, setRecordingConflict] = useState<{
    binding: KeyBinding;
    with: Shortcut;
  } | null>(null);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<{
    binding: KeyBinding;
    matches: Shortcut[];
  } | null>(null);

  const setFindingActive = (v: boolean) => {
    setFinding(v);
    if (!v) setFound(null);
  };

  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderHeight(el.offsetHeight));
    ro.observe(el);
    setHeaderHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Starting a recording drops the finder filter, so the row moves: follow it.
  useEffect(() => {
    if (!recordingId) return;
    document
      .querySelector(`[data-shortcut-id="${recordingId}"]`)
      ?.scrollIntoView({ block: "center" });
  }, [recordingId]);

  const startRecording = (id: ShortcutId) => {
    setFindingActive(false);
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
    const hits = found && new Set(found.matches.map((m) => m.id));
    const base = SHORTCUTS.filter(
      (s) => !HIDDEN_IDS.has(s.id) && (!hits || hits.has(s.id)),
    );
    if (!search) return base;
    const lower = search.toLowerCase();
    return base.filter(
      (s) =>
        s.label.toLowerCase().includes(lower) ||
        s.group.toLowerCase().includes(lower),
    );
  }, [search, found]);

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

  return (
    <div className="flex flex-col gap-6">
      <div
        ref={headerRef}
        className="sticky top-0 z-10 -mt-2 -mx-1 flex flex-col gap-4 bg-background px-1 pt-2 pb-3"
      >
        <div className="flex items-center justify-between">
          <SectionHeader title="Shortcuts" />
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
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
          <KeyFinder
            active={finding}
            found={found}
            disabled={recordingId !== null}
            userShortcuts={userShortcuts}
            onActiveChange={setFindingActive}
            onFound={setFound}
          />
        </div>
      </div>

      {found && filteredShortcuts.length === 0 && (
        <p className="text-[12px] text-muted-foreground italic">
          No shortcut uses these keys.
        </p>
      )}

      <div className="flex flex-col gap-8">
        {SHORTCUT_GROUPS.map((group) => {
          const items = filteredShortcuts.filter((s) => s.group === group);
          if (items.length === 0) return null;

          return (
            <div key={group} className="flex flex-col gap-3">
              <h3
                style={{ top: headerHeight }}
                className="sticky z-[5] -mt-1 bg-background py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
              >
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
  const isModified =
    userBindings !== undefined &&
    !(
      userBindings.length === shortcut.defaultBindings.length &&
      userBindings.every((b, i) =>
        bindingsEqual(b, shortcut.defaultBindings[i]),
      )
    );
  const hasBindings = bindings && bindings.length > 0;

  return (
    <div
      data-shortcut-id={shortcut.id}
      className="group flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-muted/30"
    >
      <div className="flex flex-col gap-0.5">
        <span
          className={cn(
            "text-[12.5px] font-medium",
            (isModified || isRecording) && "text-primary",
          )}
        >
          {shortcut.label}
        </span>
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
            <button
              type="button"
              title="Change shortcut"
              onClick={onStartRecording}
              className="flex min-w-[100px] cursor-pointer items-center justify-end gap-1 text-left"
            >
              {hasBindings ? (
                <KbdGroup>
                  {isModified && (
                    <span className="mr-1 text-[10px] font-medium text-muted-foreground">
                      Custom
                    </span>
                  )}
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
            </button>

            <div className="flex items-center gap-1">
              {isModified ? (
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
  const current = SHORTCUTS.find((c) => c.id === currentId);
  for (const s of SHORTCUTS) {
    if (s.id === currentId) continue;
    // A palette shortcut is only live while its palette is open, so it never competes with the index jumps.
    if (
      (s.group === "Palette" && current?.id.endsWith("selectByIndex")) ||
      (current?.group === "Palette" && s.id.endsWith("selectByIndex"))
    )
      continue;
    const bindings =
      s.id in userShortcuts ? userShortcuts[s.id] : s.defaultBindings;
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

      const binding = bindingFromEvent(e);

      const conflicting = findConflict(binding, currentId, userShortcuts);
      if (conflicting) {
        onConflict({ binding, with: conflicting });
        return;
      }

      onConflict(null);
      onRecord(binding);
    };

    window.addEventListener("keydown", onDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onDown, { capture: true });
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
              <Kbd
                key={i}
                className="border-destructive/60 text-destructive bg-destructive/10"
              >
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
    <div
      ref={containerRef}
      className="flex items-center gap-2 rounded bg-accent/50 px-2 py-1 text-[11px] ring-1 ring-accent"
    >
      <span className="animate-pulse font-medium">Recording...</span>
      <span className="text-muted-foreground">(Esc to cancel)</span>
    </div>
  );
}

function KeyFinder({
  active,
  found,
  disabled,
  userShortcuts,
  onActiveChange,
  onFound,
}: {
  active: boolean;
  found: { binding: KeyBinding } | null;
  disabled: boolean;
  userShortcuts: Record<ShortcutId, KeyBinding[]>;
  onActiveChange: (v: boolean) => void;
  onFound: (f: { binding: KeyBinding; matches: Shortcut[] }) => void;
}) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: KeyboardEvent) => {
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        onActiveChange(false);
        return;
      }
      onFound({
        binding: bindingFromEvent(e),
        matches: shortcutsForEvent(e, userShortcuts),
      });
    };
    window.addEventListener("keydown", onDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onDown, { capture: true });
  }, [active, userShortcuts, onActiveChange, onFound]);

  if (active) {
    return (
      <div className="flex h-9 shrink-0 items-center gap-2 rounded bg-accent/50 px-2 py-1 text-[11px] ring-1 ring-accent">
        {found ? (
          <KbdGroup>
            {getBindingTokens(found.binding).map((t, i) => (
              <Kbd key={i}>{t}</Kbd>
            ))}
          </KbdGroup>
        ) : (
          <span className="animate-pulse font-medium">Press keys...</span>
        )}
        <span className="text-muted-foreground">(Esc to cancel)</span>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      title="Press a key combination to see which shortcut it triggers"
      className="h-9 shrink-0 gap-1.5 px-2.5 text-[11px]"
      onClick={() => onActiveChange(true)}
    >
      <HugeiconsIcon icon={KeyboardIcon} size={13} strokeWidth={2} />
      Find by keys
    </Button>
  );
}

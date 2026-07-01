import { useDroppable } from "@dnd-kit/core";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ENTER_KEY } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setTerminalScratchpadEnterSends } from "@/modules/settings/store";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { SCRATCHPAD_DROP_PREFIX } from "./lib/scratchpadPath";
import {
  closeScratchpad,
  getLeafScratchpadDraft,
  setLeafScratchpadActive,
  setLeafScratchpadDraft,
  setLeafScratchpadFocus,
  setLeafScratchpadFocused,
  setLeafScratchpadInsert,
  submitToLeaf,
} from "./lib/useTerminalSession";

const MAX_TEXTAREA_HEIGHT = 160; // px, ~6 lines
const ROTATE_MS = 5_000;

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
}

function placeholderMessages(
  enterSends: boolean,
  switchLabel: string | null,
  hasAgent: boolean,
): string[] {
  return [
    enterSends
      ? "Enter sends. Shift+Enter new line"
      : "Shift+Enter sends. Enter new line",
    switchLabel
      ? `Esc closes. ${switchLabel} opens the scratchpad again`
      : "Esc closes the scratchpad",
    switchLabel
      ? `${switchLabel} toggles scratchpad`
      : "Define a shortcut to toggle the scratchpad in settings",
    hasAgent ? "Enter your prompt" : "Enter your command",
    "Drag files onto the scratchpad",
  ];
}

type Props = {
  leafId: string;
};

export function ScratchpadBar({ leafId }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(() => getLeafScratchpadDraft(leafId));
  const [focused, setFocused] = useState(false);
  const enterSends = usePreferencesStore((s) => s.scratchpadEnterSends);
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const hasAgent = useAgentStore((s) => Boolean(s.sessions[leafId]));
  const { setNodeRef, isOver } = useDroppable({
    id: `${SCRATCHPAD_DROP_PREFIX}${leafId}`,
  });

  // Rotate the placeholder by wall-clock bucket so every open bar shows the same
  // hint, advancing on the 30s boundary rather than from mount time.
  const [, tick] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    const t = setTimeout(tick, ROTATE_MS - (Date.now() % ROTATE_MS) + 50);
    return () => clearTimeout(t);
  });

  const insertAtCursor = useCallback(
    (insertText: string) => {
      const el = textareaRef.current;
      const value = el?.value ?? getLeafScratchpadDraft(leafId);
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      const before = value.slice(0, start);
      const after = value.slice(end);
      const lead = before.length > 0 && !/\s$/.test(before) ? " " : "";
      const trail = after.length === 0 || !/^\s/.test(after) ? " " : "";
      const piece = `${lead}${insertText}${trail}`;
      const next = before + piece + after;
      setText(next);
      setLeafScratchpadDraft(leafId, next);
      const caret = before.length + piece.length;
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(caret, caret);
        autoResize(node);
      });
    },
    [leafId],
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Register the focus callback; do NOT focus on mount. Focus is driven by
    // the session (focusLeaf / focus-gain / cycle) so an open scratchpad on a
    // non-active tab (e.g. on restore) never steals focus.
    setLeafScratchpadFocus(leafId, () => el.focus());
    return () => setLeafScratchpadFocus(leafId, null);
  }, [leafId]);

  useEffect(() => {
    setLeafScratchpadInsert(leafId, insertAtCursor);
    return () => setLeafScratchpadInsert(leafId, null);
  }, [leafId, insertAtCursor]);

  function send() {
    if (!text.trim()) return;
    submitToLeaf(leafId, text);
    setText("");
    setLeafScratchpadDraft(leafId, "");
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.focus();
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    setLeafScratchpadDraft(leafId, val);
    autoResize(e.target);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeScratchpad(leafId);
      return;
    }
    const isEnter = e.key === "Enter";
    if (!isEnter) return;
    const shouldSend = enterSends ? !e.shiftKey : e.shiftKey;
    if (shouldSend) {
      e.preventDefault();
      send();
    }
  }

  const switchLabel = getShortcutLabel("terminal.scratchpad", userShortcuts);
  const messages = placeholderMessages(enterSends, switchLabel, hasAgent);
  const placeholder = messages[Math.floor(Date.now() / ROTATE_MS) % messages.length];

  // Points to the other side of the toggle: in the scratchpad it offers the
  // terminal, and vice versa. Hidden while typing in the scratchpad.
  let hint: string | null = null;
  if (switchLabel) {
    if (focused) hint = text ? null : `${switchLabel} Terminal`;
    else hint = `${switchLabel} Scratchpad`;
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // m-2 reserves room outside the box for the focus glow to bleed into
        // before PaneView's overflow-hidden clips it; the blur/spread below are
        // sized to mostly fade out within that 8px margin so the glow reads as
        // an outward halo instead of getting cut off mid-fade.
        "m-2 flex shrink-0 items-end gap-2 px-3 py-2 transition-colors",
        focused &&
          "ring-1 ring-inset ring-primary/50 shadow-[0_0_6px_2px_var(--tw-shadow-color)] shadow-primary/50",
        isOver && "bg-primary/10 ring-1 ring-inset ring-primary/40",
      )}
    >
      <textarea
        ref={textareaRef}
        value={text}
        rows={1}
        placeholder={focused ? placeholder : ""}
        className="min-h-[28px] w-0 flex-1 resize-none overflow-y-auto rounded bg-transparent font-mono text-sm leading-[1.4] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setFocused(true);
          setLeafScratchpadFocused(leafId, true);
          setLeafScratchpadActive(leafId, true);
        }}
        onBlur={() => {
          setFocused(false);
          setLeafScratchpadFocused(leafId, false);
        }}
      />
      <div className="flex shrink-0 items-center gap-1.5 self-center">
        {hint && (
          <span className="pointer-events-none shrink-0 select-none whitespace-nowrap text-[10px] text-muted-foreground/40">
            {hint}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Scratchpad settings"
              className="flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" sideOffset={6}>
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">
              Send
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={enterSends ? "enter" : "shift-enter"}
              onValueChange={(v) =>
                void setTerminalScratchpadEnterSends(v === "enter")
              }
            >
              <DropdownMenuRadioItem
                value="enter"
                className="flex-col items-start gap-0"
              >
                {ENTER_KEY} sends
                <span className="text-[10.5px] text-muted-foreground">
                  Like Terminal
                </span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                value="shift-enter"
                className="flex-col items-start gap-0"
              >
                {ENTER_KEY} new line
                <span className="text-[10.5px] text-muted-foreground">
                  Like text field
                </span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void openSettingsWindow("terminal")}
            >
              <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={2} />
              Terminal settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

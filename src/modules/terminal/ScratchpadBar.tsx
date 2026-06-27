import { useDroppable } from "@dnd-kit/core";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Kbd, ShortcutKeys } from "@/components/Kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setTerminalScratchpadEnterSends } from "@/modules/settings/store";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { SCRATCHPAD_DROP_PREFIX } from "./lib/scratchpadPath";
import {
  closeScratchpad,
  getLeafScratchpadDraft,
  setLeafScratchpadDraft,
  setLeafScratchpadFocus,
  setLeafScratchpadFocused,
  setLeafScratchpadInsert,
  submitToLeaf,
} from "./lib/useTerminalSession";

const MAX_TEXTAREA_HEIGHT = 160; // px, ~6 lines
const ROTATE_MS = 30_000;

// Key glyphs, not letters: shift (mayuscula) and return.
const SHIFT_GLYPH = "⇧";
const RETURN_GLYPH = "⏎";

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
      ? "Press Enter to send, Shift+Enter for a new line"
      : "Press Shift+Enter to send, Enter for a new line",
    switchLabel
      ? `Esc closes, ${switchLabel} opens the scratchpad again`
      : "Esc closes the scratchpad",
    switchLabel
      ? `${switchLabel} switches between terminal and scratchpad`
      : "Toggle the scratchpad from the terminal",
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
    el.focus(); // focus on mount -- bar just became visible
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

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex shrink-0 items-end gap-2 border-t border-border/40 px-3 py-2 transition-colors",
        isOver && "bg-primary/10 ring-1 ring-inset ring-primary/40",
      )}
    >
      <textarea
        ref={textareaRef}
        value={text}
        rows={1}
        placeholder={placeholder}
        className="min-h-[28px] w-0 flex-1 resize-none overflow-y-auto rounded bg-transparent font-mono text-sm leading-[1.4] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setLeafScratchpadFocused(leafId, true)}
        onBlur={() => setLeafScratchpadFocused(leafId, false)}
      />
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="flex items-center gap-1" title="Toggle scratchpad">
          <ShortcutKeys id="terminal.scratchpad" />
        </span>
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
          <DropdownMenuContent align="end" className="min-w-0">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">
              Send
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={enterSends ? "enter" : "shift-enter"}
              onValueChange={(v) =>
                void setTerminalScratchpadEnterSends(v === "enter")
              }
            >
              <DropdownMenuRadioItem value="enter">
                <Kbd>{RETURN_GLYPH}</Kbd>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="shift-enter">
                <span className="flex items-center gap-1">
                  <Kbd>{SHIFT_GLYPH}</Kbd>
                  <Kbd>{RETURN_GLYPH}</Kbd>
                </span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

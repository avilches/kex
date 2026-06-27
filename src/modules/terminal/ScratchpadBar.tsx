import { useDroppable } from "@dnd-kit/core";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setTerminalScratchpadEnterSends } from "@/modules/settings/store";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import { useCallback, useEffect, useRef, useState } from "react";
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

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
}

type Props = {
  leafId: string;
};

export function ScratchpadBar({ leafId }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(() => getLeafScratchpadDraft(leafId));
  const enterSends = usePreferencesStore((s) => s.scratchpadEnterSends);
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const { setNodeRef, isOver } = useDroppable({
    id: `${SCRATCHPAD_DROP_PREFIX}${leafId}`,
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

  const switchKey = getShortcutLabel("terminal.scratchpad", userShortcuts);
  const sendHint = enterSends
    ? "Enter to send, Shift+Enter for newline"
    : "Shift+Enter to send, Enter for newline";
  const placeholder = [
    sendHint,
    "Esc to close",
    switchKey ? `${switchKey} to switch` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

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
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Switch
            id="scratchpad-enter-sends"
            checked={enterSends}
            onCheckedChange={(v) => void setTerminalScratchpadEnterSends(v)}
          />
          <label
            htmlFor="scratchpad-enter-sends"
            className="cursor-pointer text-[11px] text-muted-foreground select-none"
          >
            {enterSends ? "Enter=Send" : "Shift+Enter=Send"}
          </label>
        </div>
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          className="flex h-[22px] items-center justify-center rounded bg-primary px-2.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-default disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}

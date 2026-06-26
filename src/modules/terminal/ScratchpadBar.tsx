import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setTerminalScratchpadEnterSends } from "@/modules/settings/store";
import { useEffect, useRef, useState } from "react";
import {
  closeScratchpad,
  getLeafScratchpadDraft,
  setLeafScratchpadDraft,
  setLeafScratchpadFocus,
  setLeafScratchpadFocused,
  submitToLeaf,
} from "./lib/useTerminalSession";

const MAX_TEXTAREA_HEIGHT = 160; // px, ~6 lines

type Props = {
  leafId: string;
};

export function ScratchpadBar({ leafId }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(() => getLeafScratchpadDraft(leafId));
  const enterSends = usePreferencesStore((s) => s.scratchpadEnterSends);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus(); // focus on mount -- bar just became visible
    setLeafScratchpadFocus(leafId, () => el.focus());
    return () => setLeafScratchpadFocus(leafId, null);
  }, [leafId]);

  function send() {
    if (!text.trim()) return;
    submitToLeaf(leafId, text);
    setText("");
    setLeafScratchpadDraft(leafId, "");
    textareaRef.current?.focus();
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    setLeafScratchpadDraft(leafId, val);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
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

  return (
    <div className="flex shrink-0 items-end gap-2 border-t border-border/40 px-3 py-2">
      <textarea
        ref={textareaRef}
        value={text}
        rows={1}
        placeholder="Scratchpad -- type here, send to terminal"
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
          className="flex h-[22px] items-center justify-center rounded px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}

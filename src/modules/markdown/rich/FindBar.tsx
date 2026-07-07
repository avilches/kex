import type { Editor } from "@tiptap/core";
import { ArrowDown01Icon, ArrowUp01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactElement, useEffect, useRef, useState } from "react";
import {
  applySearchDecorations,
  findMatches,
  type SearchMatch,
} from "@/modules/markdown/rich/extensions/noteSearch";

const SEARCH_DEBOUNCE_MS = 150;

function scrollToMatch(editor: Editor, match: SearchMatch): void {
  const { node } = editor.view.domAtPos(match.from);
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  el?.scrollIntoView({ block: "center" });
}

export function FindBar(props: {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
}): ReactElement | null {
  const { editor, open, onClose } = props;
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, []);

  const runSearch = (next: string) => {
    if (!editor) return;
    const found = findMatches(editor.state.doc, next);
    setMatches(found);
    setCurrentIndex(0);
    applySearchDecorations(editor, found, 0);
    if (found.length > 0) scrollToMatch(editor, found[0]);
  };

  const clearSearch = () => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (editor) applySearchDecorations(editor, [], 0);
    setMatches([]);
    setCurrentIndex(0);
  };

  const handleClose = () => {
    clearSearch();
    setQuery("");
    onClose();
  };

  const goTo = (index: number) => {
    if (!editor || matches.length === 0) return;
    const wrapped = ((index % matches.length) + matches.length) % matches.length;
    setCurrentIndex(wrapped);
    applySearchDecorations(editor, matches, wrapped);
    scrollToMatch(editor, matches[wrapped]);
  };

  if (!open) return null;

  return (
    <div className="absolute top-2 right-2 z-20 flex items-center gap-1 rounded-md border border-border bg-popover px-1.5 py-1 shadow-md">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Find in note..."
        className="h-6 w-40 bg-transparent px-1.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none"
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          if (debounceRef.current !== null) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            debounceRef.current = null;
            runSearch(next);
          }, SEARCH_DEBOUNCE_MS);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            goTo(currentIndex + (e.shiftKey ? -1 : 1));
          } else if (e.key === "Escape") {
            e.preventDefault();
            handleClose();
          }
        }}
      />
      <span className="min-w-[3ch] shrink-0 text-center text-[11px] text-muted-foreground">
        {matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : "0/0"}
      </span>
      <button
        type="button"
        onClick={() => goTo(currentIndex - 1)}
        disabled={matches.length === 0}
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        title="Previous match"
      >
        <HugeiconsIcon icon={ArrowUp01Icon} size={12} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={() => goTo(currentIndex + 1)}
        disabled={matches.length === 0}
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        title="Next match"
      >
        <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={handleClose}
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Close"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

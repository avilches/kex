import { type ReactElement, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { MathEditRequest } from "@/modules/markdown/rich/extensions/math";
import { renderKatexInto } from "@/modules/markdown/rich/extensions/math";
import type { MenuStore } from "@/modules/markdown/rich/lib/menuStore";
import { useMenuStore } from "@/modules/markdown/rich/lib/menuStore";

const PREVIEW_DEBOUNCE_MS = 200;

export function MathModal(props: {
  request: MenuStore<MathEditRequest>;
  onCommit: (req: { pos: number; kind: "block" | "inline"; tex: string }) => void;
}): ReactElement | null {
  const { request, onCommit } = props;
  const state = useMenuStore(request);
  const [tex, setTex] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!state) return;
    setTex(state.tex);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }, 0);
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const el = previewRef.current;
    if (!el) return;
    const timer = setTimeout(() => {
      renderKatexInto(el, tex, state.kind === "block");
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [tex, state]);

  if (!state) return null;

  const commit = () => {
    onCommit({ pos: state.pos, kind: state.kind, tex });
    request.set(null);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) request.set(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {state.pos < 0 ? "Insert math" : "Edit math"}
            {state.kind === "inline" ? " (inline)" : " (block)"}
          </DialogTitle>
        </DialogHeader>
        <Textarea
          ref={textareaRef}
          value={tex}
          onChange={(e) => setTex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              request.set(null);
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="E = mc^2"
          className="font-mono text-sm"
        />
        <div
          ref={previewRef}
          className="min-h-8 overflow-x-auto rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
        />
        <div className="text-xs text-muted-foreground">
          Enter or Cmd+Enter to save, Shift+Enter for a new line, Escape to cancel.
        </div>
      </DialogContent>
    </Dialog>
  );
}

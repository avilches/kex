import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  canonicalFolderText,
  completeSegment,
  expandTilde,
  planTreeMove,
  sameFolder,
  splitTypedPath,
} from "./lib/rootPathEdit";

type Props = {
  origin: string;
  rootPath: string;
  dirNames: readonly string[] | null;
  home: string | null;
  onNavigate: (path: string) => void;
  resolvePath: (typed: string) => Promise<string | null>;
  onSubmit: (typed: string) => void;
  onCancel: () => void;
};

export function RootPathInput({
  origin,
  rootPath,
  dirNames,
  home,
  onNavigate,
  resolvePath,
  onSubmit,
  onCancel,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);
  const verifySeq = useRef(0);
  const [invalid, setInvalid] = useState(false);

  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, []);

  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    verifySeq.current++;
    if (!sameFolder(rootPath, origin)) onNavigate(origin);
    onCancel();
  };

  const submit = (value: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    verifySeq.current++;
    onSubmit(value);
  };

  const evaluate = (value: string) => {
    const seq = ++verifySeq.current;
    const logical = expandTilde(value, home);
    const plan = planTreeMove(logical, rootPath, dirNames);
    if (plan.kind === "stay") {
      setInvalid(false);
    } else if (plan.kind === "go") {
      setInvalid(false);
      onNavigate(plan.path);
      const canonical = canonicalFolderText(logical, plan.path);
      if (canonical && ref.current) ref.current.value = canonical;
    } else if (plan.kind === "invalid") {
      setInvalid(true);
    } else {
      void resolvePath(plan.path).then((resolved) => {
        if (seq !== verifySeq.current || doneRef.current) return;
        if (resolved && sameFolder(resolved, plan.path)) {
          setInvalid(false);
          onNavigate(resolved);
        } else {
          setInvalid(true);
        }
      });
    }
  };

  const hasGhost = (el: HTMLInputElement) =>
    el.selectionStart !== el.selectionEnd && el.selectionEnd === el.value.length;

  const acceptGhost = (el: HTMLInputElement, withSlash: boolean) => {
    const end = el.value.length;
    el.setSelectionRange(end, end);
    if (withSlash) {
      el.value += "/";
      evaluate(el.value);
    }
  };

  return (
    <input
      ref={ref}
      defaultValue={origin}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      aria-label="Explorer root path"
      aria-invalid={invalid}
      className={cn(
        "h-6 min-w-0 flex-1 rounded border bg-background px-1.5 text-xs text-foreground outline-none",
        invalid
          ? "border-destructive focus:border-destructive"
          : "border-border focus:border-primary",
      )}
      onChange={(e) => {
        const el = e.currentTarget;
        const typed = el.value;
        const inputType = (e.nativeEvent as InputEvent).inputType ?? "";
        const atEnd = el.selectionStart === typed.length;
        const composing = (e.nativeEvent as InputEvent).isComposing;
        if (!inputType.startsWith("delete") && atEnd && !composing) {
          const { folder, partial } = splitTypedPath(expandTilde(typed, home));
          if (folder !== null && sameFolder(folder, rootPath)) {
            const match = completeSegment(partial, dirNames ?? []);
            if (match) {
              el.value = typed + match.slice(partial.length);
              el.setSelectionRange(typed.length, el.value.length);
            }
          }
        }
        evaluate(typed);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        const el = e.currentTarget;
        if (e.key === "Enter") {
          e.preventDefault();
          submit(el.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        } else if (e.key === "Tab") {
          if (hasGhost(el)) {
            e.preventDefault();
            acceptGhost(el, true);
          }
        } else if (e.key === "/" && hasGhost(el)) {
          e.preventDefault();
          acceptGhost(el, true);
        }
      }}
      onBlur={cancel}
    />
  );
}

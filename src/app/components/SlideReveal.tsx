import { useLayoutEffect, useRef, useState, type ReactNode, type TransitionEvent } from "react";
import { planReveal, REVEAL_FALLBACK_MS } from "./slideReveal";

type Props = { open: boolean; children: ReactNode };

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function SlideReveal({ open, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const visual = useRef(open);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearFallback() {
    if (fallback.current !== null) clearTimeout(fallback.current);
    fallback.current = null;
  }

  function settle() {
    clearFallback();
    const el = ref.current;
    if (visual.current) {
      if (el) el.style.height = "auto";
    } else setMounted(false);
  }

  useLayoutEffect(() => clearFallback, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: settle and clearFallback only touch refs and a state setter
  useLayoutEffect(() => {
    if (open && !mounted) {
      setMounted(true);
      return;
    }
    const el = ref.current;
    if (!el || visual.current === open) return;
    visual.current = open;
    clearFallback();
    const reduced = prefersReducedMotion();

    if (open) {
      const target = el.scrollHeight;
      if (planReveal(target, reduced) === "settle") {
        el.style.opacity = "1";
        el.style.height = "auto";
        return;
      }
      el.style.height = "0px";
      el.style.opacity = "0";
      void el.offsetHeight;
      el.style.height = `${target}px`;
      el.style.opacity = "1";
      fallback.current = setTimeout(settle, REVEAL_FALLBACK_MS);
      return;
    }

    if (planReveal(el.offsetHeight, reduced) === "settle") {
      el.style.opacity = "0";
      el.style.height = "0px";
      settle();
      return;
    }
    el.style.height = `${el.offsetHeight}px`;
    void el.offsetHeight;
    el.style.height = "0px";
    el.style.opacity = "0";
    fallback.current = setTimeout(settle, REVEAL_FALLBACK_MS);
  }, [open, mounted]);

  function handleTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || e.propertyName !== "height") return;
    settle();
  }

  if (!mounted) return null;
  return (
    <div
      ref={ref}
      onTransitionEnd={handleTransitionEnd}
      className="overflow-hidden transition-[height,opacity] duration-300 ease-[var(--ease-premium)] motion-reduce:transition-none"
    >
      {children}
    </div>
  );
}

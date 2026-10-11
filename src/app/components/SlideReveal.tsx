import { useLayoutEffect, useRef, useState, type ReactNode, type TransitionEvent } from "react";

type Props = { open: boolean; children: ReactNode };

export function SlideReveal({ open, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const visual = useRef(open);

  useLayoutEffect(() => {
    if (open && !mounted) {
      setMounted(true);
      return;
    }
    const el = ref.current;
    if (!el || visual.current === open) return;
    visual.current = open;

    if (open) {
      el.style.height = "0px";
      el.style.opacity = "0";
      void el.offsetHeight;
      el.style.height = `${el.scrollHeight}px`;
      el.style.opacity = "1";
      return;
    }

    el.style.height = `${el.offsetHeight}px`;
    void el.offsetHeight;
    el.style.height = "0px";
    el.style.opacity = "0";
  }, [open, mounted]);

  function handleTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || e.propertyName !== "height") return;
    if (visual.current) e.currentTarget.style.height = "auto";
    else setMounted(false);
  }

  if (!mounted) return null;
  return (
    <div
      ref={ref}
      onTransitionEnd={handleTransitionEnd}
      className="overflow-hidden transition-[height,opacity] duration-300 ease-[var(--ease-premium)]"
    >
      {children}
    </div>
  );
}

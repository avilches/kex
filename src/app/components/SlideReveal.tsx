import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const DURATION_MS = 300;

type Props = { open: boolean; children: ReactNode };

export function SlideReveal({ open, children }: Props) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), DURATION_MS + 50);
    return () => clearTimeout(timer);
  }, [open]);

  if (!mounted) return null;
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease-premium)]",
        shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { SpinnerStyle } from "@/modules/settings/store";
import { useSyncExternalStore } from "react";

export const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const BRAILLE_INTERVAL_MS = 80;

let brailleFrame = 0;
let brailleTimer: ReturnType<typeof setInterval> | null = null;
const brailleListeners = new Set<() => void>();

function subscribeBraille(listener: () => void) {
  brailleListeners.add(listener);
  if (brailleTimer === null) {
    brailleTimer = setInterval(() => {
      brailleFrame = (brailleFrame + 1) % BRAILLE_FRAMES.length;
      for (const l of brailleListeners) l();
    }, BRAILLE_INTERVAL_MS);
  }
  return () => {
    brailleListeners.delete(listener);
    if (brailleListeners.size === 0 && brailleTimer !== null) {
      clearInterval(brailleTimer);
      brailleTimer = null;
    }
  };
}

function getBrailleFrame() {
  return brailleFrame;
}

function BrailleGlyph({ size, className }: { size: number; className?: string }) {
  const frame = useSyncExternalStore(subscribeBraille, getBrailleFrame);
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-block shrink-0 text-center font-mono leading-none", className)}
      style={{ fontSize: size * 1.2, width: size, height: size, lineHeight: `${size}px` }}
    >
      {BRAILLE_FRAMES[frame]}
    </span>
  );
}

type SpinnerProps = {
  size?: number;
  style?: SpinnerStyle;
  className?: string;
};

// The one spinner of the app. The look comes from the spinnerStyle preference;
// color is text-primary unless the caller overrides it through className.
function Spinner({ size = 14, style, className }: SpinnerProps) {
  const pref = usePreferencesStore((s) => s.spinnerStyle);
  const kind = style ?? pref;
  if (kind === "braille") {
    return <BrailleGlyph size={size} className={cn("text-primary", className)} />;
  }
  if (kind === "cursor") {
    return (
      <span
        role="status"
        aria-label="Loading"
        className={cn("kex-spinner-cursor inline-block shrink-0 rounded-[1px] bg-primary", className)}
        style={{ width: Math.max(3, Math.round(size * 0.5)), height: size }}
      />
    );
  }
  return (
    <svg
      role="status"
      aria-label="Loading"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      className={cn("shrink-0 animate-spin text-primary", className)}
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
  );
}

export { Spinner };

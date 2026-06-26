import { cn } from "@/lib/utils";

// Attention flash shared by the explorer reveal, the locked-tab lock icon and
// the tab itself. Renders an absolutely-positioned overlay that pulses the
// primary color twice over its parent (which must be `relative`). `variant`
// picks how: "fill" tints the whole parent, "ring" outlines its border. The
// `key` is the trigger: bumping `token` remounts the span, so the CSS animation
// (terax-flash, styles/globals.css) replays from its first keyframe. This needs
// no effects, no rAF and no className mutation, so it survives React 19 strict
// mode double-mounts and re-renders that would otherwise drop the animation.
export function FlashOverlay({
  token,
  variant = "fill",
  className,
}: {
  token: number;
  variant?: "fill" | "ring";
  className?: string;
}) {
  if (!token) return null;
  return (
    <span
      key={token}
      aria-hidden
      className={cn(
        "terax-flash-overlay pointer-events-none absolute inset-0 rounded-[inherit]",
        // The ring variant reuses the exact outline of the center drop indicator
        // (same ring-2 thickness and rounded-md corners).
        variant === "ring"
          ? "terax-flash-ring rounded-md ring-2 ring-inset ring-primary/60"
          : "terax-flash-fill",
        className,
      )}
    />
  );
}

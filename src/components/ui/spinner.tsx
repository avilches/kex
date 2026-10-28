import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { SpinnerStyle } from "@/modules/settings/store";
import type { CSSProperties, ReactNode } from "react";

type SpinnerProps = {
  size?: number;
  style?: SpinnerStyle;
  className?: string;
};

const items = (n: number, className: string) =>
  Array.from({ length: n }, (_, i) => <i key={i} className={className} />);

function Shell({
  kind,
  className,
  style,
  children,
}: {
  kind: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(kind, "inline-flex shrink-0", className)}
      style={style}
    >
      {children}
    </span>
  );
}

// The one spinner of the app. The look comes from the spinnerStyle preference;
// color is text-primary unless the caller overrides it through className.
// Every look animates transform or opacity in CSS, never with a JS timer.
function Spinner({ size = 14, style, className }: SpinnerProps) {
  const pref = usePreferencesStore((s) => s.spinnerStyle);
  const kind = style ?? pref;
  const text = cn("text-primary", className);

  switch (kind) {
    case "cursor":
      return (
        <Shell
          kind="kex-spinner-cursor"
          className={cn("rounded-[1px] bg-primary", className)}
          style={{ width: Math.max(3, Math.round(size * 0.5)), height: size }}
        />
      );
    case "bar":
      return (
        <Shell
          kind="kex-spinner-bar"
          className={cn("relative overflow-hidden rounded-[2px] bg-primary/20", className)}
          style={{ width: size * 1.7, height: Math.max(2, Math.round(size / 5)) }}
        >
          <i className="absolute inset-y-0 left-0 w-2/5 rounded-[2px] bg-primary" />
        </Shell>
      );
    case "equalizer":
      return (
        <Shell
          kind="kex-spinner-eq"
          className={cn("items-center gap-[1.5px]", text)}
          style={{ height: size }}
        >
          {items(4, "h-full w-[2px] rounded-[1px] bg-current")}
        </Shell>
      );
    case "wave":
      return (
        <Shell
          kind="kex-spinner-wave"
          className={cn("items-end gap-[2px]", text)}
          style={{ height: size * 0.6 }}
        >
          {items(4, "size-[3px] rounded-[1px] bg-current")}
        </Shell>
      );
    case "chevrons":
      return (
        <Shell kind="kex-spinner-chev" className={text}>
          {Array.from({ length: 3 }, (_, i) => (
            <svg
              key={i}
              width={size * 0.55}
              height={size}
              viewBox="0 0 8 14"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 2l5 5-5 5" />
            </svg>
          ))}
        </Shell>
      );
    case "grid":
      return (
        <Shell
          kind="kex-spinner-grid"
          className={cn("grid grid-cols-2 gap-[1.5px]", text)}
          style={{ width: size * 0.8, height: size * 0.8 }}
        >
          {items(4, "rounded-[1px] bg-current")}
        </Shell>
      );
    case "scanner":
      return (
        <Shell
          kind="kex-spinner-scan"
          className={cn("gap-[1.5px]", text)}
          style={{ height: size * 0.7 }}
        >
          {items(5, "h-full w-[3px] rounded-[1px] bg-current")}
        </Shell>
      );
    case "tile":
      return (
        <Shell
          kind="kex-spinner-tile"
          className={cn("rounded-[2px] bg-primary", className)}
          style={{ width: size * 0.75, height: size * 0.75 }}
        />
      );
    case "diamond":
      return (
        <Shell
          kind="kex-spinner-diamond"
          className={cn("rounded-[1.5px] bg-primary", className)}
          style={{ width: size * 0.7, height: size * 0.7 }}
        />
      );
    default:
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
}

export { Spinner };

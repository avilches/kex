import { useLayoutEffect, useRef, useState } from "react";

// The text box is right-to-left so overflow is cut at the start of a long text and keeps its
// tail, while text-left keeps a short one flush with its left edge; the inner bdo run stops
// the bidi algorithm from moving the leading separator. The ellipsis is drawn by hand, only
// once the box is measured as clipped, because text-overflow does not mark a start cut.
export function StartTrimmed({ text, className }: { text: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the clip is re-measured when the text changes
  useLayoutEffect(() => {
    const el = box.current;
    if (el) setClipped(el.scrollWidth > el.clientWidth);
  }, [text]);
  return (
    <span className={className} title={text}>
      {clipped && <span className="shrink-0">…</span>}
      <span
        ref={box}
        dir="rtl"
        className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left"
      >
        <bdo dir="ltr">{text}</bdo>
      </span>
    </span>
  );
}

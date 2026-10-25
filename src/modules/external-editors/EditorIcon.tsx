import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { DocumentCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function EditorIcon({ id, size = 14, className }: { id: string; size?: number; className?: string }) {
  const [src, setSrc] = useState(`/assets/editors/${id}.svg`);
  const [failed, setFailed] = useState(false);

  // useState initial value is only used on mount; reset when id changes.
  useEffect(() => {
    setSrc(`/assets/editors/${id}.svg`);
    setFailed(false);
  }, [id]);

  if (failed) {
    return <HugeiconsIcon icon={DocumentCodeIcon} size={size} strokeWidth={1.75} className={className} />;
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      onError={() => {
        if (src.endsWith(".svg")) {
          setSrc(`/assets/editors/${id}.png`);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

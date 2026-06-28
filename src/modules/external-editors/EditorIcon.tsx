import { useState } from "react";
import { DocumentCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function EditorIcon({ id, size = 14 }: { id: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <HugeiconsIcon icon={DocumentCodeIcon} size={size} strokeWidth={1.75} />;
  }
  return (
    <img
      src={`/assets/editors/${id}.svg`}
      alt=""
      width={size}
      height={size}
      className="shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

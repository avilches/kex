import { useState } from "react";
import { DocumentCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function EditorIcon({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <HugeiconsIcon icon={DocumentCodeIcon} size={14} strokeWidth={1.75} />;
  }
  return (
    <img
      src={`/assets/editors/${id}.svg`}
      alt=""
      width={14}
      height={14}
      className="shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

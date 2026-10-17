import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openTitleTemplatesSettings } from "@/modules/settings/openSettingsWindow";
import { type TitleSubject, titleVariableDocs } from "./lib/titleTemplate";

export function TitleVariablesHelp({ subject }: { subject: TitleSubject }) {
  const names = titleVariableDocs(subject).map((v) => `{${v.name}}`);
  return (
    <div className="flex items-start gap-1.5">
      <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground/60">
        You can use {names.join(" ")}
      </p>
      <button
        type="button"
        title="Edit the default titles in Settings"
        aria-label="Edit the default titles in Settings"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void openTitleTemplatesSettings()}
        className="flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={Settings01Icon} size={12} />
      </button>
    </div>
  );
}

import { writeClipboardText } from "@/lib/clipboard";
import { CommandLineIcon, Copy01Icon, Folder02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { tildePath } from "./lib/sessionPreview";

const COPIED_MS = 1200;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    if (!(await writeClipboardText(text))) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };
  return (
    <button
      type="button"
      title={copied ? "Copied" : label}
      aria-label={label}
      onClick={() => void copy()}
      className="flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
    >
      <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={12} strokeWidth={2} />
    </button>
  );
}

function InfoRow({ icon, label, shown, full, copyLabel }: { icon: IconSvgElement; label: string; shown: string; full: string; copyLabel: string }) {
  return (
    <>
      <span className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-wider opacity-60">
        <HugeiconsIcon icon={icon} size={11} strokeWidth={2} className="shrink-0" />
        {label}
      </span>
      <span title={full} data-hibernated-value={label.toLowerCase()} className="truncate font-mono text-[11.5px] opacity-70">
        {shown}
      </span>
      <CopyButton text={full} label={copyLabel} />
    </>
  );
}

type Props = {
  icon: ReactNode;
  title: string;
  folder: string | null;
  command: string | null;
  home: string | null;
};

// The name of the sleeping tab, then what it was doing as a small table: where and what to run.
export function HibernatedInfo({ icon, title, folder, command, home }: Props) {
  return (
    <div className="flex max-w-full flex-col items-start gap-2 self-stretch text-left">
      <span className="flex max-w-full items-center gap-2 text-[15px] text-foreground">
        <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
        <span className="truncate">{title}</span>
      </span>
      {(folder || command) && (
        <div
          data-hibernated-table
          className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5"
        >
          {folder && (
            <InfoRow icon={Folder02Icon} label="Folder" shown={tildePath(folder, home)} full={folder} copyLabel="Copy folder" />
          )}
          {command && (
            <InfoRow icon={CommandLineIcon} label="Command" shown={command} full={command} copyLabel="Copy command" />
          )}
        </div>
      )}
    </div>
  );
}

import { ArrowDown01Icon, ArrowRight01Icon, CommandLineIcon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, type ReactNode } from "react";
import type { InfoVariant } from "./lib/infoVariant";

type Props = {
  variant: InfoVariant;
  icon: ReactNode;
  title: string;
  folder: string | null;
  command: string | null;
};

const ROW = "flex max-w-full items-center gap-1.5 font-mono text-[11.5px]";

function TitleRow({ icon, title }: Pick<Props, "icon" | "title">) {
  return (
    <span className="flex max-w-full items-center gap-2 text-[15px] text-foreground">
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="truncate">{title}</span>
    </span>
  );
}

function FolderRow({ folder }: { folder: string }) {
  return (
    <span title={folder} data-hibernated-folder className={ROW}>
      <HugeiconsIcon icon={Folder01Icon} size={12} strokeWidth={2} className="shrink-0" />
      <span className="truncate">{folder}</span>
    </span>
  );
}

function CommandRow({ command }: { command: string }) {
  return (
    <span title={command} className={`${ROW} opacity-70`}>
      <HugeiconsIcon icon={CommandLineIcon} size={12} strokeWidth={2} className="shrink-0" />
      <span className="truncate">{command}</span>
    </span>
  );
}

// Experiment: four arrangements of the same three lines, picked per card by `infoVariantFor`.
export function HibernatedInfo({ variant, icon, title, folder, command }: Props) {
  const [open, setOpen] = useState(false);
  const head = <TitleRow icon={icon} title={title} />;
  const rows = [folder && <FolderRow key="f" folder={folder} />, command && <CommandRow key="c" command={command} />].filter(
    Boolean,
  );
  const tag = (
    <span data-hibernated-variant={variant} className="absolute top-2 left-3 text-[9px] uppercase opacity-40">
      {variant}
    </span>
  );
  const frame = "flex max-w-full flex-col items-start gap-1.5 self-stretch text-left";

  if (variant === "indent") {
    return (
      <div className={frame}>
        {tag}
        {head}
        {rows.length > 0 && <div className="ml-1.5 flex max-w-full flex-col gap-1.5 border-l-[1.5px] border-border pl-3.5">{rows}</div>}
      </div>
    );
  }
  if (variant === "box") {
    return (
      <div className={frame}>
        {tag}
        {head}
        {rows.length > 0 && (
          <div className="flex w-full flex-col gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
            {folder && command ? [rows[0], <div key="sep" className="h-px bg-border" />, rows[1]] : rows}
          </div>
        )}
      </div>
    );
  }
  if (variant === "collapsible") {
    return (
      <div className={frame}>
        {tag}
        {head}
        {rows.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="ml-[22px] flex items-center gap-1 text-[11px] transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={open ? ArrowDown01Icon : ArrowRight01Icon} size={11} strokeWidth={2} />
            Details
          </button>
        )}
        {open && <div className="ml-[22px] flex max-w-full flex-col gap-1.5">{rows}</div>}
      </div>
    );
  }
  return (
    <div className={frame}>
      {tag}
      {head}
      {rows.length > 0 && (
        <div className="grid w-full grid-cols-[3.75rem_minmax(0,1fr)] items-baseline gap-x-2.5 gap-y-1.5">
          {folder && (
            <>
              <span className="text-[9.5px] uppercase tracking-wider opacity-60">Folder</span>
              <span title={folder} data-hibernated-folder className="truncate font-mono text-[11.5px]">
                {folder}
              </span>
            </>
          )}
          {command && (
            <>
              <span className="text-[9.5px] uppercase tracking-wider opacity-60">Command</span>
              <span title={command} className="truncate font-mono text-[11.5px] opacity-70">
                {command}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

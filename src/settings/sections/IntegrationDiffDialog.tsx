import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  type FilePreview,
  previewIntegration,
} from "@/modules/agents/lib/integrationActions";
import type { AgentId } from "@/modules/agents/lib/integrations";
import { collapseContext, diffLines } from "@/modules/agents/lib/lineDiff";
import { useEffect, useMemo, useState } from "react";

type Props = {
  agent: AgentId;
  name: string;
  /** What the dialog previews: the install when the agent is missing, the removal when it is there. */
  install: boolean;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

type Loaded = { files: FilePreview[] } | { error: string } | null;

export function IntegrationDiffDialog({
  agent,
  name,
  install,
  open,
  busy,
  onOpenChange,
  onConfirm,
}: Props) {
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoaded(null);
    setTab(0);
    previewIntegration(agent, install)
      .then((files) => alive && setLoaded({ files }))
      .catch((e) => alive && setLoaded({ error: String(e) }));
    return () => {
      alive = false;
    };
  }, [open, agent, install]);

  const files = loaded && "files" in loaded ? loaded.files : [];
  const file = files[tab];
  const rows = useMemo(
    () =>
      file
        ? collapseContext(diffLines(file.before ?? "", file.after ?? ""))
        : [],
    [file],
  );
  const verb = install ? "Install" : "Uninstall";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {verb} {name} integration
          </DialogTitle>
          <DialogDescription>
            {install
              ? "This is what Install would write. Nothing has been changed yet."
              : "This is what Uninstall would remove. Everything else in the files stays as it is."}
          </DialogDescription>
        </DialogHeader>

        {files.length > 1 && (
          <div className="flex gap-1">
            {files.map((f, i) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setTab(i)}
                className={cn(
                  "rounded-md px-2 py-1 font-mono text-[11px] transition-colors",
                  i === tab
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.path}
              </button>
            ))}
          </div>
        )}
        {files.length === 1 && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {file.path}
          </span>
        )}

        {file?.note && (
          <p className="text-[11px] text-muted-foreground">{file.note}</p>
        )}

        <div className="min-h-24 min-w-0 flex-1 overflow-auto rounded-lg border border-border/60 bg-background py-2 font-mono text-[11.5px] leading-relaxed">
          <div className="w-max min-w-full">
            {loaded === null && (
              <div className="flex items-center gap-2 px-3 text-muted-foreground">
                <Spinner size={12} /> Reading files...
              </div>
            )}
            {loaded && "error" in loaded && (
              <p className="px-3 text-destructive">{loaded.error}</p>
            )}
            {loaded && "files" in loaded && files.length === 0 && (
              <p className="px-3 text-muted-foreground">
                Nothing to change: already up to date.
              </p>
            )}
            {rows.map((row, i) =>
              row.kind === "gap" ? (
                <div key={i} className="px-3 text-muted-foreground/70">
                  {`... ${row.hidden} unchanged ${row.hidden === 1 ? "line" : "lines"}`}
                </div>
              ) : (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre px-3",
                    row.kind === "add" &&
                      "bg-green-500/15 text-green-600 dark:text-green-400",
                    row.kind === "del" && "bg-destructive/15 text-destructive",
                  )}
                >
                  {row.kind === "add" ? "+ " : row.kind === "del" ? "- " : "  "}
                  {row.text}
                </div>
              ),
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            size="sm"
            variant={install ? "default" : "outline"}
            disabled={
              busy || loaded === null || (loaded !== null && "error" in loaded)
            }
            onClick={onConfirm}
          >
            {verb}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

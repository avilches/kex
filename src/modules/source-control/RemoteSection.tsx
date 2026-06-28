import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { GitRemoteInfo } from "@/lib/native";
import { cn } from "@/lib/utils";
import { Add01Icon, GlobalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, type FormEvent } from "react";

type Props = {
  remotes: GitRemoteInfo[];
  selectedRemote: string | null;
  busy: boolean;
  onSelectRemote: (name: string) => void;
  onAddRemote: (name: string, url: string) => Promise<void>;
};

export function RemoteSection({
  remotes,
  selectedRemote,
  busy,
  onSelectRemote,
  onAddRemote,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);

  if (remotes.length === 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          title="No remote configured - click to add one"
          className="inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        >
          <HugeiconsIcon icon={Add01Icon} size={10} strokeWidth={2} />
          Add remote
        </button>
        <AddRemoteDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onAdd={onAddRemote}
        />
      </>
    );
  }

  if (remotes.length === 1) {
    return null;
  }

  const activeRemote = selectedRemote ?? remotes[0]?.name ?? "";

  return (
    <RemotePicker
      remotes={remotes}
      activeRemote={activeRemote}
      busy={busy}
      onSelect={onSelectRemote}
    />
  );
}

function RemotePicker({
  remotes,
  activeRemote,
  busy,
  onSelect,
}: {
  remotes: GitRemoteInfo[];
  activeRemote: string;
  busy: boolean;
  onSelect: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          title="Select active remote"
          className={cn(
            "inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors",
            busy
              ? "cursor-default opacity-50"
              : "hover:bg-muted/70 hover:text-foreground",
          )}
        >
          <HugeiconsIcon icon={GlobalIcon} size={10} strokeWidth={2} />
          <span>{activeRemote}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="start" side="bottom">
        <div className="space-y-0.5">
          {remotes.map((r) => (
            <button
              key={r.name}
              type="button"
              onClick={() => {
                onSelect(r.name);
                setOpen(false);
              }}
              className={cn(
                "flex w-full flex-col rounded px-2 py-1.5 text-left transition-colors hover:bg-accent",
                activeRemote === r.name && "bg-accent/60",
              )}
            >
              <span className="text-[11px] font-medium">{r.name}</span>
              <span className="min-w-0 truncate text-[9px] text-muted-foreground">
                {r.url}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AddRemoteDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (name: string, url: string) => Promise<void>;
}) {
  const [name, setName] = useState("origin");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = (o: boolean) => {
    if (!busy) {
      onOpenChange(o);
      if (!o) setError(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const u = url.trim();
    if (!n || !u) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(n, u);
      setUrl("");
      onOpenChange(false);
    } catch (err) {
      setError(
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : "Failed to add remote",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Add remote</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="origin"
              className="h-8 text-xs"
              disabled={busy}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">
              URL
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="h-8 text-xs"
              disabled={busy}
            />
          </div>
          {error ? (
            <p className="text-[11px] text-destructive">{error}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy || !name.trim() || !url.trim()}
            >
              {busy ? "Adding..." : "Add remote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

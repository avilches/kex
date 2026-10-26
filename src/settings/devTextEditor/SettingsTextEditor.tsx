import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import type { TextEntry } from "./entries";
import { type Editable, locateEditable, observeOverrides, setOverrides } from "./reconcile";

const ENDPOINT = "/__kex-settings-texts";

const KIND_LABEL = { text: "Text", title: "Tooltip", placeholder: "Placeholder" } as const;

type Session = { editable: Editable; x: number; y: number };

async function call(init?: RequestInit): Promise<TextEntry[]> {
  const res = await fetch(ENDPOINT, init);
  const body = (await res.json()) as { entries?: TextEntry[]; error?: string };
  if (!res.ok || !body.entries) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.entries;
}

const post = (payload: unknown) =>
  call({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

export default function SettingsTextEditor({ section }: { section: string }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    call()
      .then((entries) => {
        if (!cancelled) setOverrides(entries, document.body);
      })
      .catch((e) => console.error("settings texts load failed:", e));
    const stop = observeOverrides(document.body);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      const editable = locateEditable(e.target, e.clientX, e.clientY);
      if (!editable) return;
      e.preventDefault();
      setSession({ editable, x: e.clientX, y: e.clientY });
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  return (
    <Popover open={session !== null} onOpenChange={(open) => !open && setSession(null)}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-0"
          style={{ left: session?.x ?? 0, top: session?.y ?? 0 }}
        />
      </PopoverAnchor>
      {session && (
        <EditorBody
          key={`${session.editable.kind}:${session.editable.original}:${session.x}:${session.y}`}
          editable={session.editable}
          section={section}
          onDone={() => setSession(null)}
        />
      )}
    </Popover>
  );
}

function EditorBody({
  editable,
  section,
  onDone,
}: {
  editable: Editable;
  section: string;
  onDone: () => void;
}) {
  const { kind, original, current } = editable;
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const edited = current !== original;
  const trimmed = value.trim();
  const canSave = !busy && trimmed.length > 0 && trimmed !== current;

  const run = async (payload: unknown) => {
    setBusy(true);
    try {
      setOverrides(await post(payload), document.body);
      onDone();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const save = () => {
    if (!canSave) return;
    if (trimmed === original) return restore();
    void run({ op: "set", entry: { section, kind, original, edited: trimmed } });
  };
  const restore = () => void run({ op: "remove", kind, original });

  return (
    <PopoverContent
      data-settings-text-editor
      align="start"
      className="w-80 gap-2 p-3 select-text"
    >
      <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
        <span>Edit {KIND_LABEL[kind].toLowerCase()}</span>
        <span>{section}</span>
      </div>
      <Textarea
        autoFocus
        value={value}
        rows={3}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
        className="min-h-14 rounded-md px-2.5 py-2 text-[12.5px]"
      />
      {edited && (
        <p className="line-clamp-2 text-[11px] text-muted-foreground">Was: {original}</p>
      )}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <div className="flex items-center justify-between">
        <Button size="xs" variant="ghost" disabled={busy || !edited} onClick={restore}>
          Restore
        </Button>
        <Button size="xs" disabled={!canSave} onClick={save}>
          Save
        </Button>
      </div>
    </PopoverContent>
  );
}

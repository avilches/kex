import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Cancel01Icon,
  Folder01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { fileIconUrl } from "./lib/iconResolver";
import { copyToClipboard, revealInFinder } from "./lib/contextActions";
import { COMPACT_CONTENT, COMPACT_ITEM } from "./lib/menuItemClass";
import { cn } from "@/lib/utils";

type SearchHit = {
  path: string;
  rel: string;
  name: string;
  is_dir: boolean;
};

type SearchResult = {
  hits: SearchHit[];
  truncated: boolean;
};

// "idle"   = no active query
// "phase1" = both calls in flight, no results shown yet  -> "Searching..."
// "phase2" = phase 1 done (results shown), phase 2 running -> "Searching deeper..."
// "done"   = phase 2 complete
type SearchPhase = "idle" | "phase1" | "phase2" | "done";

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 300;
// Depth for the fast first pass: covers root + two subdirectory levels (e.g. src/modules/).
const PHASE_1_DEPTH = 3;

type Props = {
  rootPath: string;
  onOpenFile: (path: string) => void;
  open: boolean;
  onRequestClose: () => void;
  onActiveChange?: (active: boolean) => void;
  onRevealInTerminal?: (path: string) => void;
  onAttachToAgent?: (path: string) => void;
};

export type ExplorerSearchHandle = {
  focus: () => void;
  isFocused: () => boolean;
};

export const ExplorerSearch = forwardRef<ExplorerSearchHandle, Props>(function ExplorerSearch({
  rootPath,
  onOpenFile,
  open,
  onRequestClose,
  onActiveChange,
  onRevealInTerminal,
  onAttachToAgent,
}: Props,
  ref,
) {
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [truncated, setTruncated] = useState(false);
  const [contextHit, setContextHit] = useState<SearchHit | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastKeyboardNavAt = useRef(0);
  // Tracks the path of the currently selected item so phase-2 can restore selection.
  const selectedPathRef = useRef<string | null>(null);

  const active = query.trim().length > 0;

  // Keep selectedPathRef current whenever the selected item changes.
  useEffect(() => {
    selectedPathRef.current = results[selectedIndex]?.path ?? null;
  }, [selectedIndex, results]);

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setPhase("idle");
      setTruncated(false);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LEN) {
      setResults([]);
      setSelectedIndex(0);
      setPhase("idle");
      setTruncated(false);
      return;
    }
    setPhase("phase1");
    let alive = true;

    const handle = setTimeout(async () => {
      const workspace = currentWorkspaceEnv();

      // Both calls start in parallel after the debounce.
      const fastSearch = invoke<SearchResult>("fs_search", {
        root: rootPath,
        query: q,
        limit: 200,
        maxDepth: PHASE_1_DEPTH,
        showHidden,
        workspace,
      });

      const deepSearch = invoke<SearchResult>("fs_search", {
        root: rootPath,
        query: q,
        limit: 200,
        showHidden,
        workspace,
      });

      // Phase 1: show shallow hits immediately; switch label to "Searching deeper…".
      // If the shallow scan found nothing, stay in phase1 and let phase2 show results.
      fastSearch
        .then((res) => {
          if (!alive || res.hits.length === 0) return;
          setResults(res.hits);
          setSelectedIndex(0);
          setTruncated(res.truncated);
          setPhase("phase2");
        })
        .catch(() => {
          // Fast search failed; still waiting for deep.
        });

      // Phase 2: replace with fully-ranked results; preserve keyboard selection by path.
      try {
        const res = await deepSearch;
        if (!alive) return;
        const prevPath = selectedPathRef.current;
        const newIdx = prevPath
          ? res.hits.findIndex((h) => h.path === prevPath)
          : -1;
        setResults(res.hits);
        setTruncated(res.truncated);
        setSelectedIndex(newIdx >= 0 ? newIdx : 0);
      } catch (e) {
        if (alive) {
          console.error("fs_search failed:", e);
          setResults([]);
          setTruncated(false);
          setSelectedIndex(0);
        }
      } finally {
        if (alive) setPhase("done");
      }
    }, DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [query, rootPath, showHidden]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      },
      isFocused: () => document.activeElement === inputRef.current,
    }),
    [],
  );

  useEffect(() => {
    if (active && results.length > 0) {
      const el = scrollRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, results, active]);

  const handleSelect = (hit: SearchHit) => {
    if (!hit.is_dir) {
      onOpenFile(hit.path);
    }
  };

  const searching = phase === "phase1" || phase === "phase2";
  const searchLabel = phase === "phase2" ? "Searching deeper…" : "Searching…";

  return (
    <div className="flex flex-col">
      {open ? (
        <div className="relative shrink-0 px-2 py-1.5 animate-in fade-in-0 slide-in-from-top-3 duration-200 ease-out">
          <HugeiconsIcon
            icon={Search01Icon}
            size={13}
            strokeWidth={2}
            className="absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onRequestClose();
                return;
              }
              if (results.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  lastKeyboardNavAt.current = Date.now();
                  setSelectedIndex((prev) => (prev + 1) % results.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  lastKeyboardNavAt.current = Date.now();
                  setSelectedIndex(
                    (prev) => (prev - 1 + results.length) % results.length,
                  );
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  handleSelect(results[selectedIndex]);
                }
              }
            }}
            placeholder="Search files…"
            className="h-7 pr-7 pl-6.5 text-xs"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-3.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
            </button>
          ) : null}
        </div>
      ) : null}

      {active ? (
        <ScrollArea className="min-h-0 flex-1">
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div className="py-1" ref={scrollRef}>
                {results.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground">
                    {phase === "done" ? "No matches" : searchLabel}
                  </div>
                ) : (
                  results.map((hit, index) => {
                    const url = hit.is_dir ? null : fileIconUrl(hit.name);
                    const isSelected = index === selectedIndex;
                    return (
                      <button
                        key={hit.path}
                        type="button"
                        data-index={index}
                        onClick={() => handleSelect(hit)}
                        onContextMenu={() => setContextHit(hit)}
                        onMouseEnter={() => {
                          if (Date.now() - lastKeyboardNavAt.current > 250) {
                            setSelectedIndex(index);
                          }
                        }}
                        className={cn(
                          "flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs transition-colors",
                          isSelected
                            ? "bg-accent text-foreground"
                            : "hover:bg-accent/50 text-foreground/80",
                        )}
                        title={hit.path}
                      >
                        {url ? (
                          <img src={url} alt="" className="size-3.5 shrink-0" />
                        ) : (
                          <HugeiconsIcon
                            icon={Folder01Icon}
                            size={13}
                            strokeWidth={1.75}
                            className="shrink-0 text-muted-foreground"
                          />
                        )}
                        <span className="truncate">{hit.name}</span>
                        <span className="ml-auto truncate text-[10px] text-muted-foreground">
                          {hit.rel}
                        </span>
                      </button>
                    );
                  })
                )}
                {searching && results.length > 0 ? (
                  <div className="px-3 py-1.5 text-[10px] text-muted-foreground">
                    {searchLabel}
                  </div>
                ) : !searching && truncated && results.length > 0 ? (
                  <div className="px-3 py-1.5 text-[10px] text-muted-foreground">
                    Showing partial results - refine your query.
                  </div>
                ) : null}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className={COMPACT_CONTENT}>
              {contextHit && !contextHit.is_dir && (
                <ContextMenuItem
                  className={COMPACT_ITEM}
                  onSelect={() => onOpenFile(contextHit.path)}
                >
                  Open
                </ContextMenuItem>
              )}
              {contextHit?.is_dir && onRevealInTerminal && (
                <ContextMenuItem
                  className={COMPACT_ITEM}
                  onSelect={() => onRevealInTerminal(contextHit.path)}
                >
                  Open in Terminal
                </ContextMenuItem>
              )}
              <ContextMenuItem
                className={COMPACT_ITEM}
                onSelect={() => contextHit && void revealInFinder(contextHit.path)}
              >
                Reveal in Finder
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                className={COMPACT_ITEM}
                onSelect={() => contextHit && void copyToClipboard(contextHit.path)}
              >
                Copy Path
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                className={COMPACT_ITEM}
                onSelect={() => onAttachToAgent?.(contextHit?.path ?? "")}
              >
                Attach to Agent
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </ScrollArea>
      ) : null}
    </div>
  );
});

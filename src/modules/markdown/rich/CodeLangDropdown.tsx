import { type ReactElement, useEffect, useRef, useState } from "react";
import { getCodeLanguages } from "@/modules/markdown/rich/extensions/codeBlock";
import type { CodeLangDropdownState } from "@/modules/markdown/rich/extensions/codeBlock";
import type { MenuStore } from "@/modules/markdown/rich/lib/menuStore";
import { useMenuStore } from "@/modules/markdown/rich/lib/menuStore";

export function CodeLangDropdown(props: { store: MenuStore<CodeLangDropdownState>; onSelect: (lang: string) => void }): ReactElement | null {
  const { store, onSelect } = props;
  const state = useMenuStore(store);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (state) setSearch("");
  }, [state]);

  useEffect(() => {
    if (!state) return;
    inputRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (!state) return;
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) store.set(null);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [state, store]);

  if (!state) return null;

  const query = search.toLowerCase();
  const filtered = query ? getCodeLanguages().filter((l) => l.includes(query)) : getCodeLanguages();

  function selectLang(lang: string) {
    onSelect(lang);
    store.set(null);
  }

  return (
    <div
      ref={containerRef}
      className="bg-popover border border-border rounded-md shadow-md text-[12px] fixed z-50 w-48"
      style={{ left: state.x, top: state.y }}
    >
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            store.set(null);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length > 0) selectLang(filtered[0]);
          }
        }}
        placeholder="Language..."
        className="w-full border-b border-border bg-transparent px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <div className="thin-scrollbar max-h-64 overflow-auto py-1">
        {filtered.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => selectLang(lang)}
            className="block w-full truncate px-2 py-1 text-left text-foreground hover:bg-accent"
          >
            {lang}
          </button>
        ))}
      </div>
    </div>
  );
}

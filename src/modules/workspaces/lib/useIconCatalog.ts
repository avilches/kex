import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  catalogVersion,
  ensureCatalog,
  loadedCatalog,
  searchCatalog,
  subscribeCatalog,
  type CatalogEntry,
} from "./iconCatalog";

// Re-renders the caller once the full icon catalog has loaded.
export function useIconCatalogVersion(): number {
  return useSyncExternalStore(subscribeCatalog, catalogVersion);
}

// Searches the whole Hugeicons set; `loading` is true while its chunk loads.
export function useIconSearch(query: string, limit: number): { results: CatalogEntry[]; loading: boolean } {
  const version = useIconCatalogVersion();
  const active = query.trim().length > 0;
  useEffect(() => {
    if (active) void ensureCatalog();
  }, [active]);
  const catalog = loadedCatalog();
  const results = useMemo(
    () => (catalog ? searchCatalog(catalog, query, limit) : []),
    // `version` changes when the catalog arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, query, limit, version],
  );
  return { results, loading: active && !catalog };
}

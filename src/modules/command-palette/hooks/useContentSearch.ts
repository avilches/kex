import { currentWorkspaceEnv } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { type AsyncQueryState, useAsyncQuery } from "./useAsyncQuery";

export const CONTENT_SEARCH_MIN_QUERY = 2;
const LIMIT = 80;
const DEBOUNCE_MS = 140;

export type ContentHit = {
  path: string;
  rel: string;
  line: number;
  text: string;
};

type GrepResponse = {
  hits: ContentHit[];
  truncated: boolean;
  files_scanned: number;
};

let nextRequestId = 0;

export function useContentSearch(
  root: string | null,
  term: string,
  enabled: boolean,
): AsyncQueryState<ContentHit> {
  const run = useCallback(
    async (q: string, signal: AbortSignal): Promise<ContentHit[]> => {
      if (!root || signal.aborted) return [];
      const requestId = ++nextRequestId;
      const cancel = () => {
        void invoke("fs_grep_cancel", { requestId });
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const res = await invoke<GrepResponse>("fs_grep_interactive", {
          pattern: q,
          root,
          requestId,
          maxResults: LIMIT,
          workspace: currentWorkspaceEnv(),
        });
        return signal.aborted ? [] : res.hits;
      } finally {
        signal.removeEventListener("abort", cancel);
      }
    },
    [root],
  );

  return useAsyncQuery({
    enabled: enabled && !!root,
    term,
    minLength: CONTENT_SEARCH_MIN_QUERY,
    debounceMs: DEBOUNCE_MS,
    run,
  });
}

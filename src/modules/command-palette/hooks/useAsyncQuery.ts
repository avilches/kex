import { useCallback, useEffect, useRef, useState } from "react";

type Params<T> = {
  enabled: boolean;
  term: string;
  minLength: number;
  debounceMs: number;
  run: (term: string, signal: AbortSignal) => Promise<T[]>;
};

export type AsyncQueryState<T> = {
  results: T[];
  loading: boolean;
  error: string | null;
  retry: () => void;
};

export function useAsyncQuery<T>({
  enabled,
  term,
  minLength,
  debounceMs,
  run,
}: Params<T>): AsyncQueryState<T> {
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  const execute = useCallback((q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    runRef
      .current(q, signal)
      .then((hits) => {
        if (requestId !== requestIdRef.current || signal.aborted) return;
        setResults(hits);
      })
      .catch((e) => {
        if (requestId !== requestIdRef.current || signal.aborted) return;
        setResults([]);
        setError(String(e));
      })
      .finally(() => {
        if (requestId === requestIdRef.current && !signal.aborted) setLoading(false);
      });
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (!enabled || term.length < minLength) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setResults([]);
    setLoading(true);
    setError(null);
    const handle = window.setTimeout(() => execute(term), debounceMs);
    return () => {
      window.clearTimeout(handle);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [enabled, term, minLength, debounceMs, execute]);

  const retry = useCallback(() => {
    if (enabled && term.length >= minLength) execute(term);
  }, [enabled, term, minLength, execute]);

  return { results, loading, error, retry };
}

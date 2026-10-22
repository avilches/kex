import { homeDir } from "@tauri-apps/api/path";

let home: string | null = null;
let loading: Promise<void> | null = null;

// The home folder in the app's canonical form (forward slashes, no trailing one), read once.
// Callers that cannot wait ask for the cache and get null until the first read lands.
export function primeHomeDir(): Promise<void> {
  loading ??= Promise.resolve()
    .then(() => homeDir())
    .then((h) => {
      home = h.replace(/\\/g, "/").replace(/\/$/, "") || null;
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

export function cachedHomeDir(): string | null {
  void primeHomeDir();
  return home;
}

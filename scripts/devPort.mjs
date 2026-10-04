import net from "node:net";

export const BASE_PORT = 1420;
const WORKTREE_SPAN = 500;

const isWorktreePath = (root) => /[\\/]\.claude[\\/]worktrees[\\/]/.test(root);

// FNV-1a: stable across runs and machines, unlike anything seeded.
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** The checkout keeps the classic port; each worktree gets its own, stable per path. */
export function preferredPort(root) {
  if (!isWorktreePath(root)) return BASE_PORT;
  return BASE_PORT + 1 + (hashString(root) % WORKTREE_SPAN);
}

/** First free port from the preferred one, wrapping inside the worktree range. */
export async function pickPort(root, isFree, tries = 50) {
  const start = preferredPort(root);
  if (start === BASE_PORT) return (await isFree(start)) ? start : pickWorktreePort(BASE_PORT + 1, isFree, tries);
  return pickWorktreePort(start, isFree, tries);
}

async function pickWorktreePort(start, isFree, tries) {
  for (let i = 0; i < tries; i++) {
    const port = BASE_PORT + 1 + ((start - BASE_PORT - 1 + i) % WORKTREE_SPAN);
    if (await isFree(port)) return port;
  }
  throw new Error(`No free dev port found in ${BASE_PORT + 1}-${BASE_PORT + WORKTREE_SPAN}`);
}

export function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port);
  });
}

/** Tauri CLI args for `tauri dev` on a given port; every other command passes through. */
export function buildTauriArgs(args, port) {
  if (args[0] !== "dev") return args;
  const config = JSON.stringify({ build: { devUrl: `http://localhost:${port}` } });
  return [...args, "--config", config];
}

// `pnpm tauri ...` entry point. For `tauri dev` it picks a Vite port that no other
// checkout is using, so several worktrees can run the app at once: the port
// reaches Vite (vite.config.ts), the Tauri CLI (--config) and the Rust build
// (build.rs) through KEX_DEV_PORT.
import { spawn } from "node:child_process";
import { buildTauriArgs, isPortFree, pickPort } from "./devPort.mjs";
import { stripClaudeSessionEnv } from "./devEnv.mjs";

const args = process.argv.slice(2);
const env = args[0] === "dev" ? { ...stripClaudeSessionEnv(process.env) } : { ...process.env };

if (args[0] === "dev" && !env.KEX_DEV_PORT) {
  env.KEX_DEV_PORT = String(await pickPort(process.cwd(), isPortFree));
}
if (args[0] === "dev") console.log(`[kex] dev server on port ${env.KEX_DEV_PORT}`);

const child = spawn("tauri", buildTauriArgs(args, env.KEX_DEV_PORT), {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

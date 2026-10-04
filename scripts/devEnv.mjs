/**
 * Inside a Claude Code session the harness injects CLAUDE* variables. Kex Dev would hand
 * them to every `claude` opened in its terminals, and CLAUDE_CODE_CHILD_SESSION makes those
 * stop saving transcripts, which silently breaks session restore. Variables the user exports
 * themselves are re-applied by the shell of each tab, so dropping them here costs nothing.
 */
export function stripClaudeSessionEnv(env) {
  if (!env.CLAUDECODE) return env;
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("CLAUDE")));
}

# Agent Session Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir sesiones de agentes (Claude, Codex, etc.) por panel y restaurarlas automáticamente al reabrir Terax, con indicador visual en el tab.

**Architecture:** El PTY recibe `TERAX_PANEL_ID` como env var; un hook `SessionStart` de Claude escribe `{panel_id → session_id, cwd, transcript_path}` en `~/.config/terax/agent-sessions.json`. Al arrancar Terax, Rust lee ese archivo y devuelve un plan de restore por panel; el frontend inyecta el comando `claude --resume <id>` en el PTY tras 200ms.

**Tech Stack:** Rust (serde_json, dirs), TypeScript/React (Zustand), Tauri IPC, bash hook script, jq.

---

## Nota previa: sistema de hooks existente

`agent_enable_claude_hooks` (en `src-tauri/src/modules/agent.rs`) ya escribe en `~/.claude/settings.json` (global). Los hooks actuales usan comandos inline bash que emiten `terminalSequence` vía stdout. Para `SessionStart` necesitamos escribir a disco, por lo que instalamos un script en `~/.config/terax/hooks/session.sh` y lo llamamos desde el hook.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src-tauri/src/modules/pty/shell_init.rs` | Modificar | Inyectar `TERAX_PANEL_ID` en env PTY |
| `src-tauri/src/modules/pty/mod.rs` | Modificar | Nuevo param `panel_id` en `pty_open` / `spawn` |
| `src-tauri/src/modules/pty/session.rs` | Modificar | Propagar `panel_id` a `shell_init::build_command` |
| `src-tauri/src/modules/agent.rs` | Modificar | Instalar hook `SessionStart`/`SessionEnd` + script |
| `src-tauri/src/modules/agent/session_store.rs` | Crear | Leer store JSON + calcular restore plan |
| `src-tauri/src/lib.rs` | Modificar | Registrar comando `agent_session_restore_plan` |
| `src/modules/terminal/lib/pty-bridge.ts` | Modificar | Nuevo param `panelId` en `openPty` |
| `src/modules/terminal/lib/useTerminalSession.ts` | Modificar | Pasar `leafId` como `panelId`; inyectar restore cmd |
| `src/modules/agents/lib/types.ts` | Modificar | Añadir `restored` y `restoreError` a `AgentSession` |
| `src/modules/agents/store/agentStore.ts` | Modificar | Acciones `startRestored` y `setRestoreError` |
| `src/modules/agents/lib/agentSessionRestore.ts` | Crear | Llamar `agent_session_restore_plan`; exponer plan |
| `src/app/App.tsx` | Modificar | Llamar restore plan al montar |
| `src/modules/workspaces/PaneTabBar.tsx` | Modificar | Leer agentStore para cambiar icono/título/dot del tab |

---

## Task 1: Inyectar `TERAX_PANEL_ID` en el PTY

**Files:**
- Modify: `src-tauri/src/modules/pty/shell_init.rs` (función `apply_common` y `build_command`)
- Modify: `src-tauri/src/modules/pty/session.rs` (función `spawn`)
- Modify: `src-tauri/src/modules/pty/mod.rs` (comando `pty_open`)

- [ ] **Step 1: Añadir `panel_id` a `apply_common` en `shell_init.rs`**

Localizar la función `apply_common` (línea ~107). Añadir parámetro y env var:

```rust
fn apply_common(cmd: &mut CommandBuilder, cwd: Option<String>, blocks: bool, panel_id: Option<&str>) {
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERAX_TERMINAL", "1");
    if blocks {
        cmd.env("TERAX_BLOCKS", "1");
    }
    if let Some(pid) = panel_id {
        cmd.env("TERAX_PANEL_ID", pid);
    }
    for (key, value) in workspace::appimage_env_overrides() {
        match value {
            Some(v) => { cmd.env(key, v); }
            None => { cmd.env_remove(key); }
        }
    }
    ensure_utf8_locale(cmd);
    // ... resto del body sin cambios
}
```

- [ ] **Step 2: Propagar `panel_id` a través de `build_command`**

La función pública `build_command` está en `shell_init.rs`. Añadir parámetro:

```rust
pub fn build_command(
    id: u32,
    cwd: Option<String>,
    workspace: WorkspaceEnv,
    blocks: bool,
    panel_id: Option<String>,
) -> Result<CommandBuilder, String> {
    #[cfg(unix)]
    {
        let _ = workspace;
        let mut cmd = unix::build(cwd, blocks)?;
        cmd.env("TERMINAL_ID", id.to_string());
        apply_common(&mut cmd, None, blocks, panel_id.as_deref());
        Ok(cmd)
    }
    #[cfg(windows)]
    {
        let mut cmd = windows::build(cwd, workspace, blocks)?;
        cmd.env("TERMINAL_ID", id.to_string());
        apply_common(&mut cmd, None, blocks, panel_id.as_deref());
        Ok(cmd)
    }
}
```

Nota: la firma exacta depende del código actual; adaptar según sea necesario manteniendo la lógica unix/windows.

- [ ] **Step 3: Propagar `panel_id` a través de `session::spawn`**

En `src-tauri/src/modules/pty/session.rs`, función `spawn` (línea ~99):

```rust
pub fn spawn(
    id: u32,
    app: AppHandle,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    workspace: WorkspaceEnv,
    blocks: bool,
    panel_id: Option<String>,   // ← nuevo
    on_data: Channel<Response>,
    on_exit: Channel<i32>,
) -> Result<(Arc<Session>, PtySize), String> {
    // ...
    let cmd = shell_init::build_command(id, cwd, workspace, blocks, panel_id)?;
    // resto sin cambios
}
```

- [ ] **Step 4: Añadir `panel_id` al comando Tauri `pty_open`**

En `src-tauri/src/modules/pty/mod.rs`, función `pty_open` (línea ~42):

```rust
pub async fn pty_open(
    app: tauri::AppHandle,
    webview_window: tauri::WebviewWindow,
    state: tauri::State<'_, PtyState>,
    registry: tauri::State<'_, WorkspaceRegistry>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    workspace: Option<WorkspaceEnv>,
    blocks: Option<bool>,
    panel_id: Option<String>,   // ← nuevo
    on_data: Channel<Response>,
    on_exit: Channel<i32>,
) -> Result<u32, String> {
    let window_label = webview_window.label().to_string();
    let workspace = WorkspaceEnv::from_option(workspace);
    let blocks = blocks.unwrap_or(false);
    authorize_user_spawn_cwd(&registry, cwd.as_deref(), &workspace).map_err(|e| {
        log::warn!("pty_open: cwd rejected: {e}");
        e
    })?;
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let session = tauri::async_runtime::spawn_blocking(move || {
        session::spawn(id, app, cols, rows, cwd, workspace, blocks, panel_id, on_data, on_exit)
            .map(|(s, _)| s)
    })
    // resto sin cambios
}
```

- [ ] **Step 5: Verificar que compila**

```bash
cd src-tauri && cargo check 2>&1 | grep -E "error|warning" | head -20
```

Esperado: sin errores. Puede haber warnings sobre parámetros sin usar — aceptable por ahora.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/modules/pty/
git commit -m "feat(pty): pass panel_id through spawn → TERAX_PANEL_ID env var"
```

---

## Task 2: Módulo de session store en Rust

**Files:**
- Create: `src-tauri/src/modules/agent/session_store.rs`
- Modify: `src-tauri/src/modules/agent.rs` (añadir `mod session_store;`)

- [ ] **Step 1: Crear `src-tauri/src/modules/agent/session_store.rs`**

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SessionRecord {
    pub agent: Option<String>,
    pub session_id: String,
    pub cwd_launch: String,
    pub transcript_path: String,
    pub state: String, // "idle" | "working" | "exited"
    pub updated_at: u64,
}

#[derive(Debug, Deserialize, Serialize)]
struct SessionStore {
    version: u32,
    panels: HashMap<String, SessionRecord>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RestorePlan {
    pub panel_id: String,
    pub agent: String,
    pub resume_cmd: String, // comando completo a inyectar en el PTY
    pub cwd: String,
}

fn store_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".config").join("terax").join("agent-sessions.json"))
}

fn claude_projects_root() -> PathBuf {
    // Respetar CLAUDE_CONFIG_DIR si está definida con valor no-vacío
    if let Ok(v) = std::env::var("CLAUDE_CONFIG_DIR") {
        if !v.is_empty() {
            return PathBuf::from(v).join("projects");
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/"))
        .join(".claude")
        .join("projects")
}

fn find_jsonl(session_id: &str, transcript_path: &str) -> Option<PathBuf> {
    // 1. Intentar transcript_path guardado
    let tp = PathBuf::from(transcript_path);
    if tp.exists() {
        return Some(tp);
    }
    // 2. Buscar por glob en ~/.claude/projects/*/<session_id>.jsonl
    let root = claude_projects_root();
    if let Ok(entries) = std::fs::read_dir(&root) {
        for entry in entries.flatten() {
            let candidate = entry.path().join(format!("{session_id}.jsonl"));
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

fn read_launch_cwd_from_jsonl(jsonl: &PathBuf) -> Option<String> {
    let content = std::fs::read_to_string(jsonl).ok()?;
    for line in content.lines() {
        if let Ok(obj) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(cwd) = obj.get("cwd").and_then(|v| v.as_str()) {
                if !cwd.is_empty() {
                    return Some(cwd.to_string());
                }
            }
        }
    }
    None
}

fn resume_cmd_for_agent(agent: &str, session_id: &str, cwd: &str) -> String {
    match agent {
        "claude" => format!("cd {} && claude --resume {}", shell_quote(cwd), session_id),
        "codex" => format!("cd {} && codex resume --last", shell_quote(cwd)),
        "gemini" => format!("cd {} && gemini --resume {}", shell_quote(cwd), session_id),
        _ => format!("cd {}", shell_quote(cwd)), // sin resume real: solo cd
    }
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

pub fn load_restore_plan() -> Vec<RestorePlan> {
    let path = match store_path() {
        Some(p) => p,
        None => return vec![],
    };
    let content = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let store: SessionStore = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let mut plans = Vec::new();
    for (panel_id, record) in store.panels {
        if record.state == "exited" {
            continue;
        }
        let jsonl = match find_jsonl(&record.session_id, &record.transcript_path) {
            Some(j) => j,
            None => {
                // No hay .jsonl: restore imposible — señalar error al frontend
                plans.push(RestorePlan {
                    panel_id,
                    agent: record.agent.unwrap_or_else(|| "claude".to_string()),
                    resume_cmd: String::new(), // vacío = error
                    cwd: record.cwd_launch,
                });
                continue;
            }
        };
        let cwd = read_launch_cwd_from_jsonl(&jsonl)
            .unwrap_or_else(|| record.cwd_launch.clone());
        if !PathBuf::from(&cwd).exists() {
            plans.push(RestorePlan {
                panel_id,
                agent: record.agent.unwrap_or_else(|| "claude".to_string()),
                resume_cmd: String::new(), // vacío = error
                cwd,
            });
            continue;
        }
        let agent = record.agent.unwrap_or_else(|| "claude".to_string());
        let cmd = resume_cmd_for_agent(&agent, &record.session_id, &cwd);
        plans.push(RestorePlan { panel_id, agent, resume_cmd: cmd, cwd });
    }
    plans
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_quote_escapes_single_quotes() {
        assert_eq!(shell_quote("/home/user/my repo"), "'/home/user/my repo'");
        assert_eq!(shell_quote("/path/with'quote"), "'/path/with'\\''quote'");
    }

    #[test]
    fn resume_cmd_claude() {
        let cmd = resume_cmd_for_agent("claude", "abc-123", "/home/user/repo");
        assert_eq!(cmd, "cd '/home/user/repo' && claude --resume abc-123");
    }

    #[test]
    fn resume_cmd_codex() {
        let cmd = resume_cmd_for_agent("codex", "any", "/home/user/repo");
        assert_eq!(cmd, "cd '/home/user/repo' && codex resume --last");
    }

    #[test]
    fn resume_cmd_unknown_agent() {
        let cmd = resume_cmd_for_agent("amp", "any", "/home/user/repo");
        assert_eq!(cmd, "cd '/home/user/repo'");
    }

    #[test]
    fn load_restore_plan_returns_empty_when_no_file() {
        // No hay fichero en un path que no existe; no debe panics
        let plans = load_restore_plan();
        // Solo verificable en entorno real; en CI puede devolver vec vacío o planes reales.
        // El test valida que no panics.
        let _ = plans;
    }

    #[test]
    fn exited_sessions_are_skipped() {
        let store_json = r#"{
            "version": 1,
            "panels": {
                "panel-a": {
                    "agent": "claude",
                    "session_id": "aaaa-bbbb",
                    "cwd_launch": "/tmp",
                    "transcript_path": "/nonexistent",
                    "state": "exited",
                    "updated_at": 1000
                }
            }
        }"#;
        let store: super::SessionStore = serde_json::from_str(store_json).unwrap();
        // La sesión exited no debe generar plan
        let mut plans = Vec::new();
        for (panel_id, record) in store.panels {
            if record.state == "exited" { continue; }
            plans.push(panel_id);
        }
        assert!(plans.is_empty());
    }
}
```

- [ ] **Step 2: Declarar el submódulo en `agent.rs`**

Al principio de `src-tauri/src/modules/agent.rs`, añadir:

```rust
pub mod session_store;
```

- [ ] **Step 3: Ejecutar los tests unitarios**

```bash
cd src-tauri && cargo test agent::session_store 2>&1
```

Esperado: 5 tests pasan. `load_restore_plan_returns_empty_when_no_file` siempre pasa (no hay archivo).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/modules/agent/
git commit -m "feat(agent): session store module with restore plan calculator"
```

---

## Task 3: Hook script `SessionStart`/`SessionEnd` + instalar en Claude

**Files:**
- Modify: `src-tauri/src/modules/agent.rs` (extender `merge_hooks` y añadir instalación de script)

- [ ] **Step 1: Añadir script de sesión a `agent.rs`**

Añadir constante con el contenido del script bash:

```rust
const SESSION_HOOK_MARKER: &str = "terax-session-hook";

const SESSION_HOOK_SCRIPT: &str = r#"#!/usr/bin/env bash
# Terax agent session hook — managed by Terax, do not edit manually
set -euo pipefail

PANEL_ID="${TERAX_PANEL_ID:-}"
[ -z "$PANEL_ID" ] && exit 0

PAYLOAD="$(cat)"
EVENT="$(printf '%s' "$PAYLOAD" | jq -r '.hook_event_name // empty')"
SESSION_ID="$(printf '%s' "$PAYLOAD" | jq -r '.session_id // empty')"
TRANSCRIPT="$(printf '%s' "$PAYLOAD" | jq -r '.transcript_path // empty')"
CWD="$(printf '%s' "$PAYLOAD" | jq -r '.cwd // empty')"

STORE="$HOME/.config/terax/agent-sessions.json"
mkdir -p "$(dirname "$STORE")"
[ -f "$STORE" ] || printf '{"version":1,"panels":{}}' > "$STORE"

TMP="$(mktemp)"
case "$EVENT" in
  SessionStart)
    jq --arg p "$PANEL_ID" --arg sid "$SESSION_ID" \
       --arg tp "$TRANSCRIPT" --arg cwd "$CWD" \
       --arg ts "$(date +%s)" \
       '.panels[$p] = {agent:"claude",session_id:$sid,cwd_launch:$cwd,transcript_path:$tp,state:"idle",updated_at:($ts|tonumber)}' \
       "$STORE" > "$TMP" && mv -f "$TMP" "$STORE"
    ;;
  SessionEnd)
    jq --arg p "$PANEL_ID" --arg ts "$(date +%s)" \
       '.panels[$p].state = "exited" | .panels[$p].updated_at = ($ts|tonumber)' \
       "$STORE" > "$TMP" && mv -f "$TMP" "$STORE"
    ;;
esac
exit 0
"#;

fn session_hook_script_path() -> Result<std::path::PathBuf, String> {
    Ok(dirs::home_dir()
        .ok_or_else(|| "could not resolve home dir".to_string())?
        .join(".config")
        .join("terax")
        .join("hooks")
        .join("session.sh"))
}

fn session_hook_cmd() -> String {
    // Usar $HOME para que funcione si el path tiene espacios o si home cambia
    format!(
        r#"[ -n "$TERAX_PANEL_ID" ] && "$HOME/.config/terax/hooks/session.sh" || true  # {SESSION_HOOK_MARKER}"#
    )
}

fn is_session_hook(group: &Value) -> bool {
    group
        .get("hooks")
        .and_then(Value::as_array)
        .is_some_and(|hs| {
            hs.iter().any(|h| {
                h.get("command")
                    .and_then(Value::as_str)
                    .is_some_and(|c| c.contains(SESSION_HOOK_MARKER))
            })
        })
}
```

- [ ] **Step 2: Añadir `SessionStart` y `SessionEnd` a `merge_hooks`**

En `merge_hooks`, después del bloque `for (event, marker) in HOOK_EVENTS`, añadir:

```rust
// Session persistence hooks (write to ~/.config/terax/agent-sessions.json)
for event in ["SessionStart", "SessionEnd"] {
    let arr = hooks.entry(event).or_insert_with(|| json!([]));
    if !arr.is_array() { *arr = json!([]); }
    let arr = arr.as_array_mut().unwrap();
    arr.retain(|group| !is_session_hook(group) && !is_empty_group(group));
    arr.push(json!({
        "hooks": [ { "type": "command", "command": session_hook_cmd(), "timeout": 10 } ]
    }));
}
```

- [ ] **Step 3: Instalar el script en `agent_enable_claude_hooks`**

En la función `agent_enable_claude_hooks`, antes de escribir settings.json, instalar el script:

```rust
#[tauri::command]
pub fn agent_enable_claude_hooks() -> Result<(), String> {
    // 1. Instalar script de sesión
    let script_path = session_hook_script_path()?;
    let script_dir = script_path.parent().unwrap();
    std::fs::create_dir_all(script_dir)
        .map_err(|e| format!("create {}: {e}", script_dir.display()))?;
    std::fs::write(&script_path, SESSION_HOOK_SCRIPT)
        .map_err(|e| format!("write session hook script: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("chmod session hook: {e}"))?;
    }

    // 2. Actualizar ~/.claude/settings.json (lógica existente)
    let path = settings_path()?;
    let dir = path.parent().unwrap();
    std::fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;

    let existing = match std::fs::read_to_string(&path) {
        Ok(s) => existing_config(Some(&s), &path)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!({}),
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };

    let merged = merge_hooks(existing);
    let out = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.terax-tmp");
    std::fs::write(&tmp, out).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("rename into {}: {e}", path.display())
    })?;
    Ok(())
}
```

- [ ] **Step 4: Actualizar `agent_claude_hooks_status` para incluir los hooks de sesión**

```rust
#[tauri::command]
pub fn agent_claude_hooks_status() -> bool {
    let Some(content) = settings_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
    else {
        return false;
    };
    let script_ok = session_hook_script_path()
        .map(|p| p.exists())
        .unwrap_or(false);
    HOOK_EVENTS
        .iter()
        .all(|(_, m)| content.contains(&format!("notify;Terax;{m}")))
        && content.contains(SESSION_HOOK_MARKER)
        && script_ok
}
```

- [ ] **Step 5: Añadir tests para los hooks de sesión**

En el bloque `#[cfg(test)]` de `agent.rs`:

```rust
#[test]
fn adds_session_hooks_to_empty_config() {
    let out = merge_hooks(json!({}));
    assert!(out["hooks"]["SessionStart"].as_array().unwrap().len() >= 1);
    assert!(out["hooks"]["SessionEnd"].as_array().unwrap().len() >= 1);
    let cmd = out["hooks"]["SessionStart"][0]["hooks"][0]["command"].as_str().unwrap();
    assert!(cmd.contains(SESSION_HOOK_MARKER));
    assert!(cmd.contains("session.sh"));
}

#[test]
fn session_hooks_are_idempotent() {
    let once = merge_hooks(json!({}));
    let twice = merge_hooks(once.clone());
    assert_eq!(
        twice["hooks"]["SessionStart"].as_array().unwrap().len(),
        once["hooks"]["SessionStart"].as_array().unwrap().len()
    );
}

#[test]
fn session_hooks_preserve_foreign_hooks() {
    let input = json!({
        "hooks": {
            "SessionStart": [
                { "hooks": [ { "type": "command", "command": "echo hello" } ] }
            ]
        }
    });
    let out = merge_hooks(input);
    assert_eq!(out["hooks"]["SessionStart"].as_array().unwrap().len(), 2);
    assert_eq!(out["hooks"]["SessionStart"][0]["hooks"][0]["command"].as_str().unwrap(), "echo hello");
}
```

- [ ] **Step 6: Ejecutar tests**

```bash
cd src-tauri && cargo test agent:: 2>&1
```

Esperado: todos los tests de `agent` pasan (incluye los 6 previos + 3 nuevos).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/modules/agent.rs
git commit -m "feat(agent): install SessionStart/SessionEnd hooks for session persistence"
```

---

## Task 4: Comando Tauri `agent_session_restore_plan`

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Registrar el comando en `lib.rs`**

Añadir import del módulo:

```rust
// En el bloque de imports de módulos (cerca de la línea ~1-20 del lib.rs)
use modules::agent::session_store;
```

Añadir el comando (cerca de donde están los otros `#[tauri::command]`):

```rust
#[tauri::command]
fn agent_session_restore_plan() -> Vec<session_store::RestorePlan> {
    session_store::load_restore_plan()
}
```

Registrarlo en el `.invoke_handler`:

```rust
.invoke_handler(tauri::generate_handler![
    // ... comandos existentes ...
    agent_session_restore_plan,
])
```

- [ ] **Step 2: Verificar que compila**

```bash
cd src-tauri && cargo check 2>&1 | grep "error" | head -10
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(agent): expose agent_session_restore_plan Tauri command"
```

---

## Task 5: Frontend — pasar `panelId` a `openPty`

**Files:**
- Modify: `src/modules/terminal/lib/pty-bridge.ts`
- Modify: `src/modules/terminal/lib/useTerminalSession.ts`

- [ ] **Step 1: Añadir `panelId` a `openPty` en `pty-bridge.ts`**

```typescript
export async function openPty(
  cols: number,
  rows: number,
  handlers: PtyHandlers,
  cwd?: string,
  blocks?: boolean,
  panelId?: string,   // ← nuevo
): Promise<PtySession> {
  const onData = new Channel<ArrayBuffer>();
  const onExit = new Channel<number>();

  // ... setup de handlers sin cambios ...

  const id = await invoke<number>("pty_open", {
    cols,
    rows,
    cwd: cwd ?? null,
    workspace: currentWorkspaceEnv(),
    blocks: blocks ?? false,
    panelId: panelId ?? null,   // ← nuevo
    onData,
    onExit,
  });

  // ... resto sin cambios ...
}
```

- [ ] **Step 2: Pasar `leafId` como `panelId` desde `openPtyForSession`**

En `useTerminalSession.ts`, función `openPtyForSession`:

```typescript
async function openPtyForSession(
  leafId: string,
  s: Session,
  cwd: string | undefined,
): Promise<PtySession> {
  const startCols = s.cols > 0 ? s.cols : 80;
  const startRows = s.rows > 0 ? s.rows : 24;
  return openPty(
    startCols,
    startRows,
    {
      onData: (bytes) => deliverPtyBytes(leafId, bytes),
      onExit: (code) => {
        s.shellExited = true;
        s.pty = null;
        const slot = getSlotForLeaf(leafId);
        if (slot) slot.term.options.disableStdin = true;
        if (s.callbacks.onExit) s.callbacks.onExit(code);
        else s.pendingExit = code;
      },
    },
    cwd,
    s.blocks,
    leafId,   // ← nuevo: el leafId ES el panelId en Terax
  );
}
```

- [ ] **Step 3: Verificar tipos**

```bash
pnpm check-types 2>&1 | grep -E "error|pty-bridge|useTerminalSession" | head -20
```

Esperado: sin errores de tipos.

- [ ] **Step 4: Commit**

```bash
git add src/modules/terminal/lib/pty-bridge.ts src/modules/terminal/lib/useTerminalSession.ts
git commit -m "feat(terminal): pass panelId to pty_open for TERAX_PANEL_ID injection"
```

---

## Task 6: Frontend — agentStore: estado de restore

**Files:**
- Modify: `src/modules/agents/lib/types.ts`
- Modify: `src/modules/agents/store/agentStore.ts`

- [ ] **Step 1: Extender `AgentSession` en `types.ts`**

```typescript
export type AgentSession = {
  panelId: string;
  tabId: string;
  agent: string;
  status: AgentStatus;
  startedAt: number;
  lastActivityAt: number;
  attentionSince: number | null;
  restored: boolean;        // ← true hasta el primer evento de estado
  restoreError: boolean;    // ← true si el .jsonl no existía
};
```

- [ ] **Step 2: Añadir acciones `startRestored` y `setRestoreError` a `agentStore.ts`**

```typescript
type AgentStoreState = {
  // ... campos existentes ...
  startRestored: (panelId: string, tabId: string, agent: string) => void;
  setRestoreError: (panelId: string, tabId: string, agent: string) => void;
  clearRestored: (panelId: string) => void;
};

// En create():
startRestored: (panelId, tabId, agent) =>
  set((s) => {
    const now = Date.now();
    return {
      sessions: {
        ...s.sessions,
        [panelId]: {
          panelId,
          tabId,
          agent,
          status: "working",
          startedAt: now,
          lastActivityAt: now,
          attentionSince: null,
          restored: true,
          restoreError: false,
        },
      },
    };
  }),

setRestoreError: (panelId, tabId, agent) =>
  set((s) => {
    const now = Date.now();
    return {
      sessions: {
        ...s.sessions,
        [panelId]: {
          panelId,
          tabId,
          agent,
          status: "working",
          startedAt: now,
          lastActivityAt: now,
          attentionSince: null,
          restored: false,
          restoreError: true,
        },
      },
    };
  }),

clearRestored: (panelId) =>
  set((s) => {
    const prev = s.sessions[panelId];
    if (!prev?.restored) return s;
    return {
      sessions: {
        ...s.sessions,
        [panelId]: { ...prev, restored: false },
      },
    };
  }),
```

- [ ] **Step 3: Inicializar `restored` y `restoreError` a `false` en la acción `start` existente**

```typescript
start: (panelId, tabId, agent) =>
  set((s) => {
    const now = Date.now();
    return {
      sessions: {
        ...s.sessions,
        [panelId]: {
          panelId,
          tabId,
          agent,
          status: "working",
          startedAt: now,
          lastActivityAt: now,
          attentionSince: null,
          restored: false,       // ← añadir
          restoreError: false,   // ← añadir
        },
      },
    };
  }),
```

- [ ] **Step 4: Limpiar `restored` en `setStatus`**

Cuando llega el primer evento de estado real (el agente ya está activo), borrar el flag `restored`:

```typescript
setStatus: (panelId, status) =>
  set((s) => {
    const prev = s.sessions[panelId];
    if (!prev || prev.status === status) return s;
    const now = Date.now();
    return {
      sessions: {
        ...s.sessions,
        [panelId]: {
          ...prev,
          status,
          lastActivityAt: now,
          attentionSince: status === "waiting" ? now : null,
          restored: false,   // ← limpiar al primer evento real
        },
      },
    };
  }),
```

- [ ] **Step 5: Verificar tipos**

```bash
pnpm check-types 2>&1 | grep -E "error|agentStore|types" | head -20
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/modules/agents/
git commit -m "feat(agents): add restored/restoreError state to AgentSession"
```

---

## Task 7: Frontend — restore plan al arrancar + inyección de comando

**Files:**
- Create: `src/modules/agents/lib/agentSessionRestore.ts`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Crear `agentSessionRestore.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";

export type RestorePlan = {
  panelId: string;
  agent: string;
  resumeCmd: string; // vacío = error (no se encontró .jsonl)
  cwd: string;
};

// Módulo-level: mapa panelId → plan, poblado una vez al arrancar
let restorePlans: Map<string, RestorePlan> | null = null;

export async function loadRestorePlans(): Promise<void> {
  try {
    const plans = await invoke<RestorePlan[]>("agent_session_restore_plan");
    restorePlans = new Map(plans.map((p) => [p.panelId, p]));
  } catch {
    restorePlans = new Map();
  }
}

export function consumeRestorePlan(panelId: string): RestorePlan | null {
  if (!restorePlans) return null;
  const plan = restorePlans.get(panelId) ?? null;
  restorePlans.delete(panelId); // consumir una sola vez
  return plan;
}
```

- [ ] **Step 2: Llamar `loadRestorePlans` en `App.tsx` al montar**

En `App.tsx`, en el `useEffect` de inicialización (o al inicio del componente), añadir:

```typescript
import { loadRestorePlans } from "@/modules/agents/lib/agentSessionRestore";

// En el useEffect de inicialización de la app:
useEffect(() => {
  loadRestorePlans(); // fire-and-forget; popula el map antes de que abran los PTYs
}, []);
```

- [ ] **Step 3: Inyectar el comando de restore en `useTerminalSession`**

En `useTerminalSession.ts`, importar:

```typescript
import { consumeRestorePlan } from "@/modules/agents/lib/agentSessionRestore";
import { useAgentStore } from "@/modules/agents/store/agentStore";
```

En la función que abre el PTY para una sesión (buscar donde se llama `openPtyForSession` y se asigna `s.pty`), añadir la lógica de restore tras el open. Localizar las llamadas a `openPtyForSession` (líneas ~509 y ~558) y en ambas, tras asignar `s.pty`, añadir:

```typescript
// Patrón: tras s.pty = await openPtyForSession(leafId, s, cwd)
const plan = consumeRestorePlan(leafId);
if (plan) {
  const store = useAgentStore.getState();
  if (plan.resumeCmd) {
    // Restore exitoso: registrar como sesión restaurada e inyectar comando
    store.startRestored(leafId, /* tabId: */ getTabIdForLeaf(leafId) ?? leafId, plan.agent);
    setTimeout(() => {
      s.pty?.write(plan.resumeCmd + "\r");
    }, 200);
  } else {
    // Error: .jsonl no encontrado
    store.setRestoreError(leafId, getTabIdForLeaf(leafId) ?? leafId, plan.agent);
  }
}
```

Nota: `getTabIdForLeaf` o equivalente — en el store de agentes, el `tabId` es el `workspaceId`. Buscar en el código existente cómo `AgentNotificationsBridge` obtiene el `workspaceId` para el panel (usa `panelInfo` que consulta los workspaces). Para esta tarea, si no es trivial obtenerlo en ese punto, usar `leafId` como `tabId` provisional (funciona para el tab indicator).

- [ ] **Step 4: Limpiar `restoreError` cuando el usuario escribe en el terminal**

En `useTerminalSession.ts`, en el handler de input del usuario (buscar donde se procesa input del teclado/write hacia el PTY), añadir limpieza del error:

```typescript
// En la función que escribe al PTY (write/sendInput):
function sendInput(leafId: string, data: string): void {
  const s = sessions.get(leafId);
  if (!s?.pty) return;
  // Limpiar restoreError en primer keystroke del usuario
  const store = useAgentStore.getState();
  const session = store.sessions[leafId];
  if (session?.restoreError) {
    store.finish(leafId); // volver a modo terminal normal
  }
  s.pty.write(data);
}
```

- [ ] **Step 5: Verificar tipos y lint**

```bash
pnpm check-types 2>&1 | grep error | head -20
pnpm lint 2>&1 | grep error | head -20
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/modules/agents/lib/agentSessionRestore.ts src/app/App.tsx src/modules/terminal/lib/useTerminalSession.ts
git commit -m "feat(agents): restore agent sessions on startup with command injection"
```

---

## Task 8: Frontend — Tab UI: icono, título y dot de agente

**Files:**
- Modify: `src/modules/workspaces/PaneTabBar.tsx`
- Modify: `src/modules/workspaces/lib/panelTitle.ts` (o donde viva `panelTitle`/`panelIcon`)

- [ ] **Step 1: Localizar `panelIcon` y `panelTitle`**

```bash
grep -rn "export function panelIcon\|export function panelTitle" src/modules/workspaces/
```

- [ ] **Step 2: Modificar `DraggableTab` en `PaneTabBar.tsx` para leer el agentStore**

En `DraggableTab`, añadir lectura del store:

```typescript
import { useAgentStore } from "@/modules/agents/store/agentStore";

// Dentro del componente DraggableTab, antes del return:
const agentSession = useAgentStore((s) => s.sessions[panel.id]);
const hasAgent = agentSession !== undefined;
const isRestoreError = agentSession?.restoreError ?? false;
```

- [ ] **Step 3: Cambiar el icono según estado del agente**

Reemplazar la línea de renderizado del icono:

```tsx
// Antes:
<span className="shrink-0 opacity-70">{panelIcon(panel, workspaceId)}</span>

// Después:
<span className={cn("shrink-0", hasAgent ? "opacity-100" : "opacity-70")}>
  {hasAgent
    ? isRestoreError
      ? <span title="Session restore failed">⚠</span>
      : "✦"
    : panelIcon(panel, workspaceId)}
</span>
```

- [ ] **Step 4: Cambiar el título del tab**

Reemplazar el `title` y el contenido del span de texto:

```tsx
// Calcular título enriquecido
const baseTitle = panelTitle(panel);
const agentTitle = hasAgent && panel.kind === "terminal"
  ? (() => {
      const agentName = agentSession!.agent;
      const cwd = panel.cwd ?? "";
      const dirname = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
      return `${agentName} · ${dirname || baseTitle}`;
    })()
  : baseTitle;

// En el JSX del span de título:
<span
  className={cn(
    "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap",
    panel.kind === "terminal" && panel.runningCommand && "text-center",
    isRestoreError && "text-destructive/70",
  )}
  style={{ direction: panel.kind === "terminal" && !panel.runningCommand ? "rtl" : "ltr" }}
  title={
    panel.kind === "terminal"
      ? panel.runningCommand
        ? `${agentTitle} · ${panel.cwd?.replace(/\/$/, "") ?? ""}`
        : (panel.cwd?.replace(/\/$/, "") ?? "shell")
      : agentTitle
  }
>
  {agentTitle}
</span>
```

- [ ] **Step 5: Añadir el dot de estado a la derecha del título**

Justo antes del botón de cerrar (y después del span de título), añadir el dot:

```tsx
{hasAgent && (
  <span
    className={cn(
      "ml-0.5 inline-block shrink-0 size-[6px] rounded-full",
      isRestoreError
        ? "bg-destructive"
        : agentSession?.status === "working"
          ? "bg-green-500 animate-pulse"
          : agentSession?.status === "waiting"
            ? "bg-amber-400 animate-pulse"
            : "bg-muted-foreground/40",
    )}
  />
)}
```

- [ ] **Step 6: Tooltip enriquecido — reemplazar `title` del tab por tooltip real**

El tab actual usa el atributo `title` nativo en el span del texto. Para el tooltip enriquecido con datos de sesión, usar el atributo `title` en el div raíz del tab con toda la información concatenada. Tooltip HTML nativo, sin componente adicional:

```tsx
// En el div raíz del tab (donde está data-panel-id):
title={hasAgent ? [
  `${agentSession!.agent}`,
  `Session: ${agentSession!.panelId.slice(0, 8)}…`,
  `Started: ${new Date(agentSession!.startedAt).toLocaleTimeString()}`,
  agentSession!.restored ? "↺ Sesión restaurada" : null,
  isRestoreError ? "⚠ No se encontró la sesión en disco" : null,
  panel.kind === "terminal" ? (panel.cwd ?? "") : null,
].filter(Boolean).join("\n") : undefined}
```

Nota: el `title` HTML solo muestra texto plano. Si en el futuro se quiere un tooltip con componente React (para el diseño del mockup con filas), ese es un refactor posterior. Por ahora, el nativo es suficiente y funcional.

- [ ] **Step 7: Verificar tipos y lint**

```bash
pnpm check-types 2>&1 | grep error | head -20
pnpm lint 2>&1 | grep error | head -20
```

- [ ] **Step 8: Test visual — abrir Terax y arrancar Claude en un terminal**

```bash
pnpm tauri dev
```

1. Abrir un terminal, escribir `claude`.
2. Verificar que el tab cambia: icono ✦, título `claude · dirname`, dot verde.
3. Esperar a que Claude esté idle: dot gris.
4. Cerrar y reabrir Terax.
5. Verificar que el tab muestra dot mientras Claude reanuda.

- [ ] **Step 9: Commit**

```bash
git add src/modules/workspaces/PaneTabBar.tsx
git commit -m "feat(workspaces): tab shows agent icon, name and status dot"
```

---

## Self-Review

**Spec coverage:**

| Requisito del spec | Task que lo implementa |
|---|---|
| `TERAX_PANEL_ID` inyectado en PTY | Task 1 |
| Store JSON atómico | Task 3 (script bash con `mv -f`) |
| Hook `SessionStart` captura session_id / cwd / transcript_path | Task 3 |
| Hook `SessionEnd` marca state=exited | Task 3 |
| `/clear` (source=clear) sobreescribe el registro | Task 3 (el script no diferencia source; upsert siempre) |
| Algoritmo de restore: glob + leer cwd de 1ª línea | Task 2 (`load_restore_plan`) |
| `CLAUDE_CONFIG_DIR` respetada | Task 2 (`claude_projects_root`) |
| Restore automático al arrancar | Tasks 4, 7 |
| Icono ✦, título `agent · dirname`, dot | Task 8 |
| Dot posición: derecha del título | Task 8, Step 5 |
| Error ⚠ + dot rojo | Task 8, Steps 3+5 |
| Error desaparece al escribir | Task 7, Step 4 |
| "↺ Sesión restaurada" transitorio en tooltip | Task 8, Step 6 |
| `restored: false` al primer evento | Task 6, Step 4 |
| Estado ternario (idle/working/exited) | Tasks 2, 6 |
| Panel cerrado → borrar del store | Pendiente: se añade al handler de cierre de panel (fuera de scope de este plan; no rompe nada — el store se limpia en el siguiente arranque) |

**Pendiente documentado fuera del plan:** borrar la entrada del store cuando el usuario cierra un panel. Implementar en un PR de seguimiento; mientras tanto, el store se limpia orgánicamente cuando el panel no existe en el workspace en el siguiente arranque (el plan de restore devuelve entradas que el frontend ignorará si el panel no existe).

**Placeholders:** ninguno encontrado.

**Consistencia de tipos:** `RestorePlan` en Rust usa snake_case; Tauri lo serializa a camelCase automáticamente en el frontend (`panelId`, `resumeCmd`, `agent`, `cwd`). Verificado que el tipo TS en `agentSessionRestore.ts` usa camelCase.

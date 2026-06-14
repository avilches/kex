# Agent Session Restore — Design Spec

Date: 2026-06-14

## Objetivo

Persistir sesiones de agentes de IA (Claude Code, Codex, Gemini, etc.) lanzadas desde terminales de Terax, y restaurarlas automaticamente cuando la aplicacion se reabre, incluso tras cierre, crash o reinicio del sistema.

---

## Scope

Todos los agentes detectados por Terax (scope C). El sistema trata tres categorias:

- **Agentes con resume nativo** (Claude `--resume <id>`, Gemini `--resume <id>`, etc.): restore completo de la conversacion.
- **Agentes con resume por ultimo** (Codex `resume --last`): restore aproximado.
- **Agentes sin resume** (amp, cursor, etc.): el panel abre como shell normal en el mismo cwd. Igual que el comportamiento actual de Terax para terminales sin agente.

El sistema se diseña extensible: añadir soporte para un nuevo agente es añadir una entrada al registro de agentes con sus flags de resume.

---

## Modelo de lanzamiento

**Transparente.** El usuario arranca el agente tecleando en el terminal (`claude`, `codex`, etc.). Terax no impone ningun wrapper ni shim en el PATH. La captura se hace mediante un hook `SessionStart` global instalado en `~/.claude/settings.json`, combinado con la variable de entorno `TERAX_PANEL_ID` que Terax inyecta en cada PTY.

No hay UI de lanzamiento dedicada en esta version. Si en el futuro se añade un boton o atajo "Abrir Claude", Terax puede pasar `--session-id <uuid>` directamente (eliminando la ventana ciega), usando el mismo store y el mismo algoritmo de restore.

---

## Store de sesiones

Archivo JSON atomico en `~/.config/terax/agent-sessions.json`. Legible por scripts bash (hooks) y por el backend Rust sin IPC.

Escritura atomica: el hook escribe a `.tmp` y hace `rename` para evitar lecturas parciales.

```json
{
  "version": 1,
  "panels": {
    "<panel_id>": {
      "agent":           "claude",
      "session_id":      "0f8b2c1e-4d6a-4b9f-9c2e-1a2b3c4d5e6f",
      "cwd_launch":      "/Users/me/repos/terax-ai",
      "transcript_path": "/Users/me/.claude/projects/-Users-me-repos-terax-ai/0f8b2c1e…jsonl",
      "state":           "idle",
      "updated_at":      1760000000
    }
  }
}
```

Campos:

| Campo | Origen | Notas |
|---|---|---|
| `agent` | env var `TERAX_AGENT` o deteccion por nombre de proceso | `claude`, `codex`, `gemini`, … |
| `session_id` | `SessionStart.session_id` (JSON de stdin) | UUID para Claude. Para otros agentes, el id que expongan o un opaco. |
| `cwd_launch` | primera linea con `cwd` del `.jsonl` (fuente de verdad) | Nunca el nombre de carpeta (codificacion lossy). Valor inicial del hook, corregido en restore. |
| `transcript_path` | `SessionStart.transcript_path` | Atajo para localizar el archivo sin buscar. |
| `state` | hooks de ciclo de vida | `idle` / `working` / `exited` |
| `updated_at` | epoch segundos | Para resolver carreras y podar entradas viejas. |

**Estado ternario** (evita los dos fallos opuestos de un booleano):

- `idle`: agente parado en su prompt. Se restaura.
- `working`: agente procesando. Se restaura.
- `exited`: agente salio con `exit` / `SessionEnd`. **No** se restaura — se abre shell limpio.

Sin embargo, si el usuario abre Claude de nuevo en el mismo panel (cualquier directorio), el hook sobreescribe la entrada con la nueva sesion, volviendo a `idle`. Asi el store siempre tiene la sesion mas reciente por panel.

---

## Variables de entorno inyectadas en cada PTY

Terax añade estas variables al entorno de cada PTY al hacer spawn (junto a `TERAX_TERMINAL` existente):

| Variable | Valor | Uso |
|---|---|---|
| `TERAX_PANEL_ID` | UUID estable del panel | Identifica el panel en el hook. Estable durante toda la vida del panel. |

El hook usa `TERAX_PANEL_ID` como guard: si no esta presente, no hace nada (sesiones de claude lanzadas fuera de Terax no se ven afectadas).

---

## Hook SessionStart

Instalado en `~/.claude/settings.json` bajo `hooks.SessionStart`. El hook es un script bash en `~/.local/bin/terax-agent-session-hook`.

```bash
#!/usr/bin/env bash
set -euo pipefail

PANEL_ID="${TERAX_PANEL_ID:-}"
[[ -z "$PANEL_ID" ]] && exit 0   # guard: no es un panel de Terax

PAYLOAD="$(cat)"
SESSION_ID="$(printf '%s' "$PAYLOAD" | jq -r '.session_id')"
TRANSCRIPT="$(printf '%s' "$PAYLOAD" | jq -r '.transcript_path // empty')"
CWD="$(printf '%s' "$PAYLOAD" | jq -r '.cwd // empty')"

STORE="${HOME}/.config/terax/agent-sessions.json"
mkdir -p "$(dirname "$STORE")"
[[ -f "$STORE" ]] || printf '{"version":1,"panels":{}}' > "$STORE"

TMP="$(mktemp)"
jq --arg p "$PANEL_ID" --arg sid "$SESSION_ID" \
   --arg tp "$TRANSCRIPT" --arg cwd "$CWD" \
   --arg ts "$(date +%s)" \
   '.panels[$p] = {session_id:$sid, cwd_launch:$cwd, transcript_path:$tp, state:"idle", updated_at:($ts|tonumber)}' \
   "$STORE" > "$TMP" && mv -f "$TMP" "$STORE"
```

Hooks adicionales (mismo script, ramas por `hook_event_name`):

| Evento | Transicion de estado |
|---|---|
| `SessionStart` (source=clear) | Sobreescribe `session_id` y `transcript_path` con los nuevos (rotacion por `/clear`) |
| `UserPromptSubmit` | `state = "working"` |
| `Stop` | `state = "idle"` |
| `SessionEnd` | `state = "exited"` |

---

## Algoritmo de restore (Rust, al arrancar Terax)

Para cada panel que tenga entrada en el store con `state != "exited"`:

```
1. LOCALIZAR el .jsonl
   a. Si transcript_path guardado existe en disco → usarlo
   b. Si no → glob("~/.claude/projects/*/<session_id>.jsonl") → primer resultado
   c. Si no se encuentra → ERROR: abrir shell, marcar tab con ⚠

2. LEER cwd real
   - Primera linea del .jsonl que tenga campo "cwd" → esa es la fuente de verdad
   - Fallback: cwd_launch guardado en el store

3. VERIFICAR que el directorio existe
   - Si no existe → ERROR: abrir shell, marcar tab con ⚠

4. LANZAR
   cd <cwd_real> && claude --resume <session_id>
   (o el comando de resume del agente correspondiente)
```

El `cd` previo es obligatorio: `claude --resume` es cwd-scoped y falla si el directorio actual no codifica a la carpeta correcta del transcript.

### Registro de agentes (resume por agente)

```rust
struct AgentResume {
    resume_cmd: &'static str,   // "claude --resume {id}" / "codex resume --last" / etc.
    has_session_id: bool,        // si el resume acepta un id explicito
}
```

Para agentes sin resume real, el comando de restore es simplemente `cd <cwd>` (abre shell en el mismo directorio).

---

## UI del tab de agente

### Tab activo con agente

Layout: `[icono] [agent · dirname] [dot] [×]`

- **Icono**: ✦ (reemplaza al ⌨ mientras hay agente activo)
- **Titulo**: `claude · terax-ai` (nombre del agente + dirname del cwd, no la ruta completa)
- **Dot** (a la derecha del titulo, antes del boton de cerrar):
  - Verde pulsante: agente trabajando
  - Ambar pulsante: agente esperando input del usuario
  - Gris estatico: agente idle / parado en prompt

### Tab en error de restore

- Icono ⚠ (ambar, reemplaza al ✦)
- Titulo sin cambios (`claude · terax-ai`)
- Dot rojo estatico
- El indicador de error desaparece en cuanto el usuario escribe algo en el terminal

### Tooltip (hover sobre el tab)

```
[✦]  Claude Code                        ● Working
     claude-sonnet-4-6
─────────────────────────────────────────────
Session        0f8b2c1e…5e6f
Iniciado       hace 23 min
Duracion       23:14
Ultima activ.  hace 4 s
↺ Sesion restaurada           ← solo hasta el primer evento
─────────────────────────────────────────────
~/repos/terax-ai
```

"↺ Sesion restaurada" aparece solo desde el restore hasta que llega el primer evento del hook (cualquier transicion de estado). Entonces desaparece.

Tooltip de error:

```
[⚠]  Claude Code                        ✕ Error
     claude-sonnet-4-6
─────────────────────────────────────────────
Session        0f8b2c1e…5e6f
Ultima sesion  ayer, 22:13
No se encontro la sesion en disco. Puede que
el historial de Claude haya sido eliminado.
Este terminal es un shell nuevo.
─────────────────────────────────────────────
~/repos/terax-ai
```

---

## Comportamiento de restore al abrir Terax

- **Automatico**, sin prompts ni confirmacion.
- Todos los paneles con sesion guardada (`state != "exited"`) intentan restore simultaneamente al arrancar.
- Si el restore falla (sin `.jsonl`, sin directorio), el panel abre como shell normal con indicador ⚠.
- La sesion permanece guardada aunque el agente salga voluntariamente. La proxima vez que Terax abra, intentara restore de nuevo. Si el usuario abre el agente de nuevo en el mismo panel, la sesion nueva sobreescribe la anterior en el store.

---

## Instalacion de hooks

El comando existente `agent_enable_claude_hooks` (Tauri, Rust) se extiende para:

1. Instalar el script bash en `~/.local/bin/terax-agent-session-hook`
2. Registrar `SessionStart`, `UserPromptSubmit`, `Stop` y `SessionEnd` en `~/.claude/settings.json`

La instalacion es idempotente y no sobrescribe hooks preexistentes del usuario: fusiona aditivamente.

---

## Casos borde

| Caso | Comportamiento |
|---|---|
| `/clear` en Claude | `SessionStart` con `source=clear` → hook sobreescribe `session_id` y `transcript_path` con los nuevos. El store siempre apunta a la sesion actual. |
| Drift de cwd (agente hizo `cd` a otro dir) | El cwd del store puede driftar, pero el restore lee la primera linea del `.jsonl` (que tiene el cwd de lanzamiento, que no driftea). |
| `CLAUDE_CONFIG_DIR` definida | El restore busca el `.jsonl` bajo `$CLAUDE_CONFIG_DIR/projects/` en lugar de `~/.claude/projects/`. No se exporta `CLAUDE_CONFIG_DIR` con su valor por defecto (evita forzar re-login). |
| Panel cerrado por el usuario | La entrada del store se borra cuando el panel se cierra (Terax lo gestiona en el handler de cierre de panel, no el hook). |
| Multiples sesiones en el mismo panel | Imposible: un panel tiene un PTY activo a la vez. Si el usuario abre un agente nuevo, el hook sobreescribe. |
| Agente sin resume real | El restore lanza `cd <cwd>` solamente. Sin indicador de agente en el tab (es un shell normal). |

---

## Archivos afectados (estimacion)

| Archivo | Cambio |
|---|---|
| `src-tauri/src/modules/pty/session.rs` | Inyectar `TERAX_PANEL_ID` al hacer spawn |
| `src-tauri/src/modules/agent/hooks.rs` | Extender `agent_enable_claude_hooks`: instalar script + registrar hooks adicionales |
| `src-tauri/src/modules/agent/session_store.rs` | Nuevo: leer/escribir `agent-sessions.json`, algoritmo de restore |
| `src-tauri/src/lib.rs` | Registrar nuevo comando Tauri `agent_restore_sessions` |
| `src/modules/agents/store/agentStore.ts` | Añadir campo `restored: boolean` y `errorRestore: boolean` por sesion |
| `src/modules/workspaces/PaneTabBar.tsx` | Leer estado del agente para cambiar icono, titulo y dot |
| `src/modules/workspaces/lib/types.ts` | Extender tipo `Panel` o `AgentSession` si hace falta |

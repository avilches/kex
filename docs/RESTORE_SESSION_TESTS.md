# Agent session restore — tests manuales

Plan de pruebas para la feature de restauracion de sesiones de agente.
Ver diseño completo en `docs/AGENT_SESSION_RESTORE.md`.

---

## Diagnostico rapido (empieza aqui si algo no funciona)

Ejecutar en orden. Cada check desbloquea el siguiente.

### D1 — Entorno de la shell

Abrir un terminal dentro de Kex y ejecutar:

```bash
echo "PANEL_ID: $KEX_PANEL_ID"
echo "TERMINAL: $KEX_TERMINAL"
```

Esperado:
- `PANEL_ID`: un UUID tipo `550e8400-e29b-41d4-a716-446655440000`
- `TERMINAL`: `1` o cualquier valor no vacío

Si `PANEL_ID` esta vacio, los hooks de sesion no funcionaran. El problema esta en
`pty/shell_init.rs` o en que no se recargo la app tras compilar.

### D2 — Hooks instalados en settings.json

```bash
cat ~/.claude/settings.json | python3 -m json.tool | grep -A3 "Session"
```

Esperado: entradas `SessionStart` y `SessionEnd` con `kex-session-hook` en el comando.

Si no aparecen, los hooks no estan instalados. Clicar el campanazo > "Set up Claude Code".

### D3 — Script de sesion existe y es ejecutable

```bash
ls -la ~/.config/kex/hooks/session.sh
head -5 ~/.config/kex/hooks/session.sh
```

Esperado: `-rwxr-xr-x` y `#!/usr/bin/env bash` en la primera linea.

### D4 — El store se escribe al lanzar claude

Lanzar `claude` dentro de Kex y esperar a que muestre el prompt (puede tardar ~5s).
Luego en otro terminal:

```bash
cat ~/.config/kex/agent-sessions.json | python3 -m json.tool
```

Esperado: objeto con `panels` que tiene una clave igual al UUID de D1, con `state: "idle"`.

Si el archivo no existe o esta vacio: los hooks `SessionStart` no se estan ejecutando.
Causa mas probable: `jq` no instalado y el fallback falla. Verificar:

```bash
which jq || echo "jq NO encontrado"
```

Si falta `jq`: instalar con `brew install jq` (macOS) o `apt install jq` (Linux).
Nota: el script tiene un fallback sin jq pero es menos robusto.

### D5 — El store sobrevive al cerrar Kex

Cerrar Kex (sin salir de claude), luego:

```bash
cat ~/.config/kex/agent-sessions.json | python3 -m json.tool
```

El `state` debe seguir siendo `"idle"` (no `"exited"`).
Si es `"exited"`: el hook `SessionEnd` se disparo antes del cierre, lo que ocurre si claude
sale solo antes de que Kex se cierre. Confirmar que claude seguia corriendo al cerrar.

### D6 — El restore plan se construye al reabrir

Abrir Kex con la consola de DevTools activa (menu > View > Toggle DevTools o en dev mode).
En la consola buscar logs de `agent_session_restore_plan`. Añadir un log temporal si es necesario:

En `src/modules/agents/lib/agentSessionRestore.ts`:
```typescript
export async function loadRestorePlans(): Promise<void> {
  try {
    const plans = await invoke<RestorePlan[]>("agent_session_restore_plan");
    console.log("[restore] plans recibidos:", plans);   // <-- temporal
    restorePlans = new Map(plans.map((p) => [p.panelId, p]));
  } catch (e) {
    console.error("[restore] error IPC:", e);           // <-- temporal
    restorePlans = new Map();
  }
}
```

Esperado: array con un objeto `{ panelId, agent, resumeCmd, cwd }`.

Si `plans` es `[]`: el Rust planner no construyo ningun plan. Causas posibles:
- `state: "exited"` en el store (ver D5)
- El JSONL de la sesion no se encuentra (ver D7)
- El `cwd` de la sesion ya no existe en disco

Si hay error IPC: problema con el comando Rust `agent_session_restore_plan`.

### D7 — El JSONL de la sesion existe

Con el `session_id` del store (campo `session_id`):

```bash
SESSION_ID="pegar-aqui-el-session-id"
find ~/.claude/projects -name "${SESSION_ID}.jsonl" 2>/dev/null
```

Esperado: una ruta como `~/.claude/projects/somethinghashed/SESSION_ID.jsonl`.

Si no aparece: claude no escribio el transcript todavia (puede pasar si la sesion era muy corta)
o `CLAUDE_CONFIG_DIR` esta configurado a otra ruta.

### D8 — El panelId del store coincide con el del panel nuevo

El problema mas sutil: al reabrir Kex, los paneles obtienen IDs nuevos (UUIDs frescos) porque
el estado de workspace se restaura desde `workspace-state.json`. Ese archivo persiste el `panel.id`.

El store guarda el `KEX_PANEL_ID` de la sesion anterior. Si ese ID coincide con el ID que
tiene el panel al restaurarse (que viene de `workspace-state.json`), funciona. Si no coincide,
`consumeRestorePlan` no encuentra el plan.

Verificar: el `panelId` en `~/.config/kex/agent-sessions.json` debe ser el mismo que el
`id` del panel en `~/.config/kex/workspaces.json` (o `workspace-state.json`).

```bash
# panel IDs en el workspace guardado
cat ~/Library/Application\ Support/app.crynta.terax/workspaces.json \
  | python3 -m json.tool | grep '"id"' | head -20

# panel IDs en el session store
cat ~/.config/kex/agent-sessions.json | python3 -m json.tool | grep -E '"panels"|{' | head -10
```

Si los IDs no coinciden: este es el bug raiz. El UUID del panel cambia entre sesiones.

---

## Bloque A — Instalacion de hooks

### A1 Estado sin hooks

Prerequisito: limpiar hooks existentes si los hay.

```bash
# Quitar entradas de Kex de settings.json (hacerlo a mano o con jq)
rm -f ~/.config/kex/hooks/session.sh
```

- [ ] Abrir Kex
- [ ] Abrir el campanazo de notificaciones (header, derecha)
- [ ] Esperado: boton o indicador "Set up Claude Code"
- [ ] Verificar: `agent_claude_hooks_status` devuelve false

### A2 Instalar hooks

- [ ] Clicar "Set up Claude Code" en el campanazo
- [ ] Verificar: `ls -la ~/.config/kex/hooks/session.sh` muestra `-rwxr-xr-x`
- [ ] Verificar: `cat ~/.claude/settings.json` tiene `kex-session-hook` en `SessionStart` y `SessionEnd`
- [ ] Verificar: tambien tiene los hooks de notificacion (`notify;Kex;working`, etc.)
- [ ] Abrir un terminal en Kex: `echo $KEX_PANEL_ID` muestra un UUID

### A3 Idempotencia

- [ ] Clicar "Set up Claude Code" una segunda vez
- [ ] Verificar: `settings.json` no tiene entradas duplicadas de Kex (cada evento debe tener exactamente 1 entrada de Kex)

---

## Bloque B — Escritura del store durante una sesion

### B1 SessionStart escribe la entrada

- [ ] Abrir terminal en Kex, anotar el UUID de `$KEX_PANEL_ID`
- [ ] Ejecutar `claude`
- [ ] Esperar el prompt de claude (5-10s)
- [ ] En otro terminal: `cat ~/.config/kex/agent-sessions.json | python3 -m json.tool`
- [ ] Esperado: entrada para el UUID anotado con `state: "idle"`, `session_id` relleno
- [ ] Verificar UI: icono `✦` en el tab, dot verde pulsando, titulo `claude · dirname`

### B2 SessionEnd marca como exited

- [ ] Dentro del terminal, salir de claude: `/exit` o Ctrl+D o `exit`
- [ ] Verificar: store tiene `state: "exited"` para ese panel ID
- [ ] Verificar UI: dot desaparece, titulo vuelve al cwd normal, icono vuelve al normal

### B3 Script no se ejecuta fuera de Kex

- [ ] Abrir Terminal.app u otro emulador externo
- [ ] Ejecutar `claude` ahi
- [ ] Verificar: `~/.config/kex/agent-sessions.json` NO se actualiza (el script hace `exit 0` si `KEX_PANEL_ID` esta vacio)

---

## Bloque C — Restauracion al reabrir

### C1 Happy path

- [ ] Abrir Kex, abrir terminal
- [ ] `cd ~/algun-proyecto-real` (el directorio debe existir)
- [ ] Ejecutar `claude`, esperar el prompt
- [ ] **Sin salir de claude**, cerrar Kex con Cmd+Q
- [ ] Verificar: `cat ~/.config/kex/agent-sessions.json` tiene `state: "idle"` (NO "exited")
- [ ] Reabrir Kex
- [ ] Esperado (primeros 200ms): el terminal recibe automaticamente `cd '/ruta' && claude --resume '<session_id>'`
- [ ] Verificar: tab muestra `✦ claude · dirname`, dot verde pulsando
- [ ] Verificar: claude arranca mostrando contexto de la sesion anterior

### C2 Dot evoluciona despues del restore

Partiendo del estado de C1 (sesion restaurada, dot verde):

- [ ] Escribir un prompt a claude (ej: "di hola"): dot verde mientras trabaja
- [ ] Claude responde: dot pasa a **amarillo pulsando** (estado "waiting")
- [ ] Escribir otro prompt: dot vuelve a **verde pulsando**
- [ ] Salir de claude (`/exit`): dot desaparece, tab vuelve a titulo normal

### C3 Sesion exited no se restaura

- [ ] Lanzar claude, salir con `/exit`
- [ ] Verificar store: `state: "exited"`
- [ ] Cerrar y reabrir Kex
- [ ] Verificar: NO se inyecta ningun comando en ese terminal
- [ ] Verificar: tab no muestra `✦` ni dot

### C4 Error de restore — JSONL no encontrado

- [ ] Abrir `~/.config/kex/agent-sessions.json` y cambiar `session_id` por un valor inventado
- [ ] Asegurarse de que `state: "idle"` (no exited)
- [ ] Reabrir Kex
- [ ] Esperado: tab muestra `⚠` (warning), dot **rojo estatico**, titulo en color rojo apagado

### C5 Error de restore — cwd borrado

- [ ] Crear directorio temporal: `mkdir /tmp/test-kex-restore`
- [ ] En Kex: `cd /tmp/test-kex-restore && claude`, esperar prompt
- [ ] Cerrar Kex
- [ ] Borrar el directorio: `rm -rf /tmp/test-kex-restore`
- [ ] Reabrir Kex
- [ ] Esperado: tab muestra `⚠`, dot rojo

### C6 Limpiar error escribiendo

Partiendo de C4 o C5 (tab en estado `⚠`):

- [ ] Pulsar cualquier tecla en el terminal
- [ ] Esperado: dot desaparece, icono vuelve al normal, titulo vuelve al cwd

### C7 Multiples paneles con agentes activos

- [ ] Crear dos panes (split): Cmd+D o Cmd+E
- [ ] Lanzar `claude` en cada pane
- [ ] Anotar ambos `$KEX_PANEL_ID`
- [ ] Cerrar Kex sin salir de ninguno
- [ ] Verificar: store tiene dos entradas con `state: "idle"`
- [ ] Reabrir Kex
- [ ] Esperado: ambos terminales restauran su sesion independientemente

---

## Bloque D — UI del tab

### D1 Titulo

| Estado | Titulo esperado |
|--------|----------------|
| Sin agente | cwd en RTL (muestra el directorio mas profundo a la izquierda) |
| Con agente | `claude · subcarpeta` (ultimo segmento del cwd del panel) |
| Agente, cwd vacio | `claude · ` + titulo normal del panel |
| Error de restore | `claude · subcarpeta` en rojo apagado |

- [ ] Verificar cada caso

### D2 Icono

| Estado | Icono |
|--------|-------|
| Sin agente | icono normal del tipo de panel |
| Con agente activo | `✦` |
| Error de restore | `⚠` |

- [ ] Verificar cada caso

### D3 Dot de estado

| Estado del agente | Color del dot | Animacion |
|-------------------|---------------|-----------|
| Trabajando (OSC "working") | verde `bg-green-500` | pulsando |
| Esperando input / tarea terminada (OSC "attention"/"finished") | amarillo `bg-amber-400` | pulsando |
| Sesion restaurada (antes del primer OSC) | verde `bg-green-500` | pulsando |
| Error de restore | rojo `bg-destructive` | estatico |
| Sin agente | sin dot | — |

- [ ] Verificar cada color
- [ ] El dot tiene 6px de tamaño — confirmar que es visible

### D4 Tooltip (bug conocido)

El tooltip enriquecido esta en el `<div>` exterior del tab. El `<span>` del texto tiene su propio
`title={cwd}` que lo oculta al hovear sobre el texto.

- [ ] Hovear sobre el texto del tab con un agente activo
- [ ] Resultado actual: aparece solo el cwd (titulo simple del span)
- [ ] Para ver el tooltip rico: hovear sobre el dot de estado o el icono `✦` (6px y pequeño)
- [ ] El tooltip rico debe mostrar:
  ```
  claude
  Session: abc12345...
  Started: HH:MM:SS
  Session restored       ← solo si fue restaurado
  Session restore failed ← solo si hubo error
  /ruta/completa/al/proyecto
  ```

Este es un bug pendiente de corregir (ver `PaneTabBar.tsx:105-112` y `165-174`).

---

## Bloque E — Edge cases

### E1 jq no instalado

- [ ] Renombrar jq temporalmente: `sudo mv $(which jq) /tmp/jq-backup`
- [ ] Lanzar claude en Kex
- [ ] Verificar si el store se escribe (el script tiene un fallback sed/awk)
- [ ] Restaurar: `sudo mv /tmp/jq-backup $(which jq)`

### E2 Store JSON corrupto

- [ ] Escribir JSON invalido en el store: `echo "{ corrupto" > ~/.config/kex/agent-sessions.json`
- [ ] Reabrir Kex
- [ ] Esperado: no hay crash, `load_restore_plan` devuelve `[]` silenciosamente

### E3 Store vacio

- [ ] Borrar el store: `rm ~/.config/kex/agent-sessions.json`
- [ ] Reabrir Kex
- [ ] Esperado: arranque normal sin ningun intento de restore

### E4 CLAUDE_CONFIG_DIR configurado

- [ ] Exportar en la shell de Kex: `export CLAUDE_CONFIG_DIR=/tmp/claude-alt`
- [ ] Lanzar claude, verificar que el transcript se crea bajo `/tmp/claude-alt/projects/`
- [ ] El store sigue en `~/.config/kex/` (no se mueve con CLAUDE_CONFIG_DIR)
- [ ] Al reabrir, el restore planner debe buscar transcripts bajo `/tmp/claude-alt/projects/`

---

## Checklist de diagnostico rapido (en caso de que no restaure)

```
[ ] echo $KEX_PANEL_ID  →  UUID no vacio
[ ] ls -la ~/.config/kex/hooks/session.sh  →  existe, permisos 755
[ ] cat ~/.claude/settings.json | grep kex-session-hook  →  aparece
[ ] cat ~/.config/kex/agent-sessions.json  →  existe, state: "idle", session_id relleno
[ ] find ~/.claude/projects -name "<session_id>.jsonl"  →  archivo encontrado
[ ] panelId en agent-sessions.json == id del panel en workspace-state.json
```

El ultimo punto (panelId == panel.id) es el mas critico. Si los IDs no coinciden,
el restore plan existe pero `consumeRestorePlan` no lo encuentra porque busca por el
nuevo panel ID, que es diferente al guardado en el store.

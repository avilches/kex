# Agent session restore - tests manuales

Plan de pruebas para la feature de restauracion de sesiones de agente.
Ver diseño completo en `docs/AGENT_SESSION_RESTORE.md`.

---

## Diagnostico rapido (empieza aqui si algo no funciona)

Ejecutar en orden. Cada check desbloquea el siguiente.

### D1 - Entorno de la shell

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

### D2 - Hooks instalados en settings.json

```bash
cat ~/.claude/settings.json | python3 -m json.tool | grep -A3 "Session"
```

Esperado: entradas `SessionStart` y `SessionEnd` con `kex-session-hook` en el comando.

Si no aparecen, los hooks no estan instalados. Clicar el campanazo > "Set up Claude Code".

### D3 - Script de sesion existe y es ejecutable

```bash
ls -la ~/.config/kex/hooks/session.sh
head -5 ~/.config/kex/hooks/session.sh
```

Esperado: `-rwxr-xr-x` y `#!/usr/bin/env bash` en la primera linea.

### D4 - El store se escribe al lanzar claude

Lanzar `claude` dentro de Kex y esperar a que muestre el prompt (puede tardar ~5s).
Luego en otro terminal:

```bash
cat ~/Library/Application Support/app.betauer.kex/agent-sessions.json | python3 -m json.tool
```

Esperado: objeto con `tabs` que tiene una clave igual al UUID de D1, con `state: "idle"`.

Si el archivo no existe o esta vacio: los hooks `SessionStart` no se estan ejecutando.
Causa mas probable: `jq` no instalado y el fallback falla. Verificar:

```bash
which jq || echo "jq NO encontrado"
```

Si falta `jq`: instalar con `brew install jq` (macOS) o `apt install jq` (Linux).
Nota: el script tiene un fallback sin jq pero es menos robusto.

### D5 - El store sobrevive al cerrar Kex

Cerrar Kex (sin salir de claude), luego:

```bash
cat ~/Library/Application Support/app.betauer.kex/agent-sessions.json | python3 -m json.tool
```

El `state` debe seguir siendo `"idle"` (no `"exited"`).
Si es `"exited"`: el hook `SessionEnd` se disparo antes del cierre, lo que ocurre si claude
sale solo antes de que Kex se cierre. Confirmar que claude seguia corriendo al cerrar.

### D6 - El restore plan se construye al reabrir

Abrir Kex con la consola de DevTools activa (menu > View > Toggle DevTools o en dev mode).
En la consola buscar logs de `agent_session_restore_plan`. Añadir un log temporal si es necesario:

En `src/modules/agents/lib/agentSessionRestore.ts`:
```typescript
export async function loadRestorePlans(): Promise<void> {
  try {
    const plans = await invoke<RestorePlan[]>("agent_session_restore_plan");
    console.log("[restore] plans recibidos:", plans);   // <-- temporal
    restorePlans = new Map(plans.map((p) => [p.tabId, p]));
  } catch (e) {
    console.error("[restore] error IPC:", e);           // <-- temporal
    restorePlans = new Map();
  }
}
```

Esperado: array con un objeto `{ tabId, agent, resumeCmd, cwdLaunch }`.

Si `plans` es `[]`: el Rust planner no construyo ningun plan. Causas posibles:
- `state: "exited"` en el store (ver D5)
- El JSONL de la sesion no se encuentra (ver D7)
- El `cwd` de la sesion ya no existe en disco

Si hay error IPC: problema con el comando Rust `agent_session_restore_plan`.

### D7 - El JSONL de la sesion existe

Con el `session_id` del store (campo `session_id`):

```bash
SESSION_ID="pegar-aqui-el-session-id"
find ~/.claude/projects -name "${SESSION_ID}.jsonl" 2>/dev/null
```

Esperado: una ruta como `~/.claude/projects/somethinghashed/SESSION_ID.jsonl`.

Si no aparece: claude no escribio el transcript todavia (puede pasar si la sesion era muy corta)
o `CLAUDE_CONFIG_DIR` esta configurado a otra ruta.

### D8 - El tabId del store coincide con el del tab nuevo

El problema mas sutil: al reabrir Kex, los tabs obtienen IDs nuevos (UUIDs frescos) porque
el estado de workspace se restaura desde `workspaces/<id>.json`. Ese archivo persiste el `tab.id`.

El store guarda el `KEX_PANEL_ID` de la sesion anterior. Si ese ID coincide con el ID que
tiene el tab al restaurarse (que viene de `workspaces/<id>.json`), funciona. Si no coincide,
`consumeRestorePlan` no encuentra el plan.

Verificar: el `tabId` en `~/Library/Application Support/app.betauer.kex/agent-sessions.json` debe ser el mismo que el
`id` del tab en `workspaces/<id>.json` (ver comando abajo).

```bash
# panel IDs en el workspace guardado
cat ~/Library/Application\ Support/app.betauer.kex/workspaces.json \
  | python3 -m json.tool | grep '"id"' | head -20

# panel IDs en el session store
cat ~/Library/Application Support/app.betauer.kex/agent-sessions.json | python3 -m json.tool | grep -E '"tabs"|{' | head -10
```

Si los IDs no coinciden: este es el bug raiz. El UUID del panel cambia entre sesiones.

---

## Bloque A - Instalacion de hooks

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

## Bloque B - Escritura del store durante una sesion

### B1 SessionStart escribe la entrada

- [ ] Abrir terminal en Kex, anotar el UUID de `$KEX_PANEL_ID`
- [ ] Ejecutar `claude`
- [ ] Esperar el prompt de claude (5-10s)
- [ ] En otro terminal: `cat ~/Library/Application Support/app.betauer.kex/agent-sessions.json | python3 -m json.tool`
- [ ] Esperado: entrada para el UUID anotado con `state: "idle"`, `session_id` relleno
- [ ] Verificar UI: icono `✦` en el tab, dot verde pulsando, titulo `claude · dirname`

### B2 SessionEnd marca como exited

- [ ] Dentro del terminal, salir de claude: `/exit` o Ctrl+D o `exit`
- [ ] Verificar: store tiene `state: "exited"` para ese panel ID
- [ ] Verificar UI: dot desaparece, titulo vuelve al cwd normal, icono vuelve al normal

### B3 Script no se ejecuta fuera de Kex

- [ ] Abrir Terminal.app u otro emulador externo
- [ ] Ejecutar `claude` ahi
- [ ] Verificar: `~/Library/Application Support/app.betauer.kex/agent-sessions.json` NO se actualiza (el script hace `exit 0` si `KEX_PANEL_ID` esta vacio)

---

## Bloque C - Restauracion al reabrir

### C1 Happy path

- [ ] Abrir Kex, abrir terminal
- [ ] `cd ~/algun-proyecto-real` (el directorio debe existir)
- [ ] Ejecutar `claude`, esperar el prompt
- [ ] **Sin salir de claude**, cerrar Kex con Cmd+Q
- [ ] Verificar: `cat ~/Library/Application Support/app.betauer.kex/agent-sessions.json` tiene `state: "idle"` (NO "exited")
- [ ] Reabrir Kex
- [ ] Esperado (primeros 200ms): el terminal recibe automaticamente `cd '/ruta' && claude --resume '<session_id>'`
- [ ] Verificar: tab muestra `✦ claude · dirname`, dot verde pulsando
- [ ] Verificar: claude arranca mostrando contexto de la sesion anterior

### C2 Dot evoluciona despues del restore

Partiendo del estado de C1 (sesion restaurada, dot verde):

- [ ] Escribir un prompt a claude (ej: "di hola"): dot verde mientras trabaja
- [ ] Claude responde: dot pasa a **amarillo pulsando** (estado "attention")
- [ ] Escribir otro prompt: dot vuelve a **verde pulsando**
- [ ] Salir de claude (`/exit`): dot desaparece, tab vuelve a titulo normal

### C3 Sesion exited no se restaura

- [ ] Lanzar claude, salir con `/exit`
- [ ] Verificar store: `state: "exited"`
- [ ] Cerrar y reabrir Kex
- [ ] Verificar: NO se inyecta ningun comando en ese terminal
- [ ] Verificar: tab no muestra `✦` ni dot

### C4 Error de restore - JSONL no encontrado

- [ ] Abrir `~/Library/Application Support/app.betauer.kex/agent-sessions.json` y cambiar `session_id` por un valor inventado
- [ ] Asegurarse de que `state: "idle"` (no exited)
- [ ] Reabrir Kex
- [ ] Esperado: tab muestra `⚠` (warning), dot **rojo estatico**, titulo en color rojo apagado

### C5 Error de restore - cwd borrado

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

## Bloque D - UI del tab

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

### D3 Indicador de estado

El indicador va a la derecha del tab, sobre el boton de cerrar (que lo sustituye al pasar el raton).

| Estado del agente | Indicador |
|-------------------|-----------|
| Trabajando | rueda (spinner), estilo `arc`, `cursor` u otros de solo CSS segun Settings > Appearance |
| Esperando al usuario (permiso, pregunta o fin de turno) | punto ambar fijo de 6 px |
| Restaurando la sesion | rueda |
| Error de restore, o sesion interrumpida al cerrar Kex | punto rojo fijo de 6 px |
| Sin agente | ninguno |

- [ ] Verificar cada caso. Ningun punto pulsa; solo gira la rueda

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

## Bloque E - Edge cases

### E1 jq no instalado

- [ ] Renombrar jq temporalmente: `sudo mv $(which jq) /tmp/jq-backup`
- [ ] Lanzar claude en Kex
- [ ] Verificar si el store se escribe (el script tiene un fallback sed/awk)
- [ ] Restaurar: `sudo mv /tmp/jq-backup $(which jq)`

### E2 Store JSON corrupto

- [ ] Escribir JSON invalido en el store: `echo "{ corrupto" > ~/Library/Application Support/app.betauer.kex/agent-sessions.json`
- [ ] Reabrir Kex
- [ ] Esperado: no hay crash, `load_restore_plan` devuelve `[]` silenciosamente

### E3 Store vacio

- [ ] Borrar el store: `rm ~/Library/Application Support/app.betauer.kex/agent-sessions.json`
- [ ] Reabrir Kex
- [ ] Esperado: arranque normal sin ningun intento de restore

### E4 CLAUDE_CONFIG_DIR configurado

- [ ] Exportar en la shell de Kex: `export CLAUDE_CONFIG_DIR=/tmp/claude-alt`
- [ ] Lanzar claude, verificar que el transcript se crea bajo `/tmp/claude-alt/projects/`
- [ ] El store sigue en `~/.config/kex/` (no se mueve con CLAUDE_CONFIG_DIR)
- [ ] Al reabrir, el restore planner debe buscar transcripts bajo `/tmp/claude-alt/projects/`

---

## Bloque F - OpenCode

Todo este bloque usa el plugin de Kex para OpenCode (TASK-758). Instalarlo con el campanazo
> "Install OpenCode integration" antes de empezar.

### F1 El plugin global carga sin config extra

- [ ] Clicar el campanazo > "Install OpenCode integration"
- [ ] Esperado en disco: `~/.config/opencode/plugins/opencode-session.js` existe (y `cat` muestra `// kex-opencode-v4` en la primera linea)
- [ ] Lanzar `opencode --print-logs` desde un terminal de Kex y crear una sesion nueva: en el log no debe aparecer ningun error del plugin (la carga del directorio global es automatica en 1.19.x)
- [ ] Reiniciar: el campanazo ya no muestra el boton OpenCode (status via `agent_opencode_plugin_status`)

### F2 La sesion nueva se graba con agent opencode

- [ ] Lanzar `opencode` en un terminal de Kex y escribir un prompt
- [ ] `cat ~/Library/Application Support/app.betauer.kex/agent-sessions.json`: entrada del tab con `agent: "opencode"`, `session_id` tipo `ses_...`, `cwd_launch` el directorio de lanzamiento y `launch_cmd: "opencode"` (grabada por OSC 133;C)
- [ ] El icono del tab aparece sin la strike de "launch unknown"
- [ ] Mientras OpenCode trabaja el tab muestra el spinner y al terminar el turno pasa a atencion una sola vez; una peticion de permiso (`bash` en modo `ask`) muestra la atencion
- [ ] Menu contextual del tab: bloque OpenCode con "Copy Session ID" y "Run on Start", sin acciones de transcript (OpenCode guarda el historial en SQLite, no en un fichero por sesion)

### F3 Restore del tab cerrado

- [ ] Cerrar el tab de la sesion y reabrir Kex
- [ ] Esperado: Kex escribe `opencode --session '<ses_id>'` (o `opencode ... --session '<ses_id>'` con los flags conservados si el lanzamiento lo tenia) en el directorio grabado
- [ ] El preview "Run on start" del tab muestra el mismo comando antes de cerrar

### F4 Resume desde el picker del TUI

- [ ] Lanzar `opencode` fresco en Kex, abrir el picker de sesiones del TUI y reanudar una sesion previa
- [ ] Esperado: el plugin registra la sesion reanudada con el primer evento que la nombra (aunque no haya `session.created`), el tab muestra el spinner mientras trabaja y la entrada del store pasa a ese `session_id`

### F5 `--session` apuntando a otro directorio

- [ ] Con una sesion grabada en `dir-a`, lanzar `opencode --session '<ses_id>'` desde `dir-b`
- [ ] Esperado: el record pasa a la sesion reanudada con `cwd_launch` = `dir-b` (el directorio desde el que se lanzo el proceso, que es donde `opencode --session` se volvera a ejecutar al restaurar)

## Bloque G - OMP

Todo este bloque usa la extension de Kex para OMP (TASK-759). Instalarla con el campanazo
> "Install OMP integration" (o Settings > General > Agents > OMP) antes de empezar.

### G1 La extension carga sin config extra

- [ ] Clicar el campanazo > "Install OMP integration"
- [ ] Esperado en disco: `~/.omp/agent/extensions/kex-agent-status.ts` existe (y `cat` muestra `// kex-agent-status-v6` en la primera linea); los ficheros `orca-*` de la misma carpeta no se tocan
- [ ] Lanzar `omp` desde un terminal de Kex: sin errores de compilacion de la extension en stderr, el TUI normal
- [ ] Reiniciar: el campanazo ya no muestra el boton OMP (status via `agent_omp_extension_status`)

### G2 La sesion nueva se graba con agent omp

- [ ] Lanzar `omp` en un terminal de Kex y escribir un prompt
- [ ] `cat ~/Library/Application Support/app.betauer.kex/agent-sessions.json`: entrada del tab con `agent: "omp"`, `session_id` UUID, `cwd_launch` el directorio de lanzamiento y `launch_cmd: "omp"` (grabado por OSC 133;C)
- [ ] El icono del tab aparece sin la strike de "launch unknown"
- [ ] Mientras el agente trabaja el spinner gira; generar una peticion de permiso (una accion de fichero en modo seguro): el tab muestra la atencion

### G3 Restore del tab cerrado

- [ ] Cerrar el tab de la sesion y reabrir Kex
- [ ] Esperado: Kex escribe `omp --resume '<uuid>'` (con los flags conservados si el lanzamiento lo tenia) en el directorio grabado
- [ ] El preview "Run on start" del tab muestra el mismo comando antes de cerrar

### G4 Resume por prefijo del id

- [ ] Lanzar `omp` fresco en Kex y reanudar una sesion previa con `omp --resume <prefijo-de-id>`
- [ ] Esperado: el evento `before_agent_start` con el id completo actualiza la entrada del tab (mismo `session_id`; `same_process` no aplica porque omp no comunica el origen, pero la sustitucion del record es indolora: mismo id y cwd)
- [ ] Nota: no midas aqui el estado de atencion en vivo del TUI reanudado antes del primer prompt; OMP y Pi emiten `session_start` al arrancar, asi que Kex ya graba la sesion antes del primer prompt

### G5 Una sesion que nunca (se) abre fichero

- [ ] Quedar en un tab donde `omp` corre en modo no interactivo `omp -p "hola"` (print mode: no se graba)
- [ ] Esperado: `agent-sessions.json` sin entrada para ese tab
- [ ] Y: borrar a mano el `.jsonl` de una sesion grabada y reabrir Kex: el scan ya no encuentra fichero, no hay plan (nada que resumir) y la entrada del store sigue ahi (no se purga nunca)

## Bloque H - Pi

Todo este bloque usa la extension de Kex para Pi (TASK-842). Instalarla con el campanazo
> "Install Pi integration" (o Settings > General > Agents > Pi) antes de empezar.

### H1 La extension carga sin config extra

- [ ] Clicar el campanazo > "Install Pi integration"
- [ ] Esperado en disco: `~/.pi/agent/extensions/kex-agent-status.ts` existe, su primera linea es `// kex-agent-status-v6` y contiene `const agent = "pi";`; los ficheros `orca-*` y `dotfiles-context.ts` de la carpeta no se tocan
- [ ] Lanzar `pi` desde un terminal de Kex: sin errores de la extension en stderr, el TUI normal
- [ ] Reiniciar: el campanazo ya no muestra el boton Pi (status via `agent_pi_extension_status`)

### H2 La sesion nueva se graba con agent pi

- [ ] Lanzar `pi` en un terminal de Kex y escribir un prompt
- [ ] `cat ~/Library/Application Support/app.betauer.kex/agent-sessions.json`: entrada del tab con `agent: "pi"`, `session_id` UUID y `cwd_launch` el directorio de lanzamiento
- [ ] El icono del tab es la letra pi (legible en tema oscuro y claro) y el spinner gira mientras trabaja; al terminar el turno el tab pasa a atencion una sola vez, sin un aviso prematuro a mitad de un reintento

### H3 Restore del tab cerrado

- [ ] Cerrar el tab de la sesion y reabrir Kex
- [ ] Esperado: Kex escribe `pi --session '<uuid>'` en el directorio grabado; el preview "Run on start" del tab muestra el mismo comando

### H4 Una sesion de Pi sin ningun turno

- [ ] Lanzar `pi` en un tab y cerrarlo sin escribir ningun prompt
- [ ] Esperado: ningun `.jsonl` nuevo bajo `~/.pi/agent/sessions/` (Pi si deja un directorio de grupo vacio, medido en pi 1.3.0). `agent-sessions.json` si tiene una entrada para el tab (la sesion se registra al arrancar), pero sin fichero: al reabrir Kex no se restaura nada
- [ ] Y: con `pi -p "hola"` (modo no interactivo) tampoco se graba nada
- [ ] Y: con `claude -p "hola"` el tab no muestra ningun icono de agente (ni tachado) ni durante ni despues, y `agent-sessions.json` no gana ninguna entrada; el log dice `UserPromptSubmit dropped` / `SessionStart dropped` y `print run ended`

## Bloque I - Integraciones: instalar, actualizar, quitar

### I1 Kex mantiene al dia lo que instalaste

- [ ] Instalar OMP, Pi y OpenCode desde Settings > General. Cerrar Kex y editar a mano la primera linea de uno de los ficheros (por ejemplo `// kex-agent-status-v1`)
- [ ] Abrir Kex: el fichero vuelve a `// kex-agent-status-v6` sin pulsar nada
- [ ] Borrar a mano `~/.pi/agent/extensions/kex-agent-status.ts` y reabrir Kex: el fichero NO reaparece y la fila de Pi dice "Not installed"
- [ ] Poner en ese mismo sitio un fichero propio (`export default () => {}`) y reabrir Kex: no se toca

### I2 Quitar

- [ ] Settings > General > Agents > OMP > Uninstall: el fichero desaparece, la fila pasa a "Not installed" y la campana vuelve a ofrecer "Install OMP integration"
- [ ] Reabrir Kex: no se reinstala solo
- [ ] Repetir con un fichero propio en la ruta: Uninstall falla con el mensaje de error y no lo borra

### I3 OMP no pierde el agente

- [ ] Lanzar `omp`, escribir un mensaje y esperar la respuesta: el icono del tab sigue sin tachar y "Run on Start" muestra el comando
- [ ] `omp --resume '<id>'` desde un tab: lo mismo, y el tab no deja de ser un tab de agente al terminar el primer mensaje
- [ ] Salir de `omp` con `/exit` o Ctrl+D: el icono desaparece (la salida real si se detecta)
- [ ] Lo mismo con `pi`: escribir un mensaje, salir con Ctrl+D y comprobar que el icono desaparece (Pi dibuja `A B C` sin `D`, y sin esto se quedaba el tab marcado como agente)
- [ ] `/new` dentro de `omp` y de `pi`: el tab sigue con su comando de arranque en "Run on Start" y sin tachar

### I4 Hibernacion

- [ ] Con un tab de OMP y otro de Pi en un workspace, hibernarlo y despertarlo
- [ ] Esperado: al reanudarse, el icono del agente aparece antes de escribir ningun mensaje y el menu contextual ofrece "Open Transcript Folder"

### I5 Menu del tab

- [ ] Tab de OMP o Pi: el bloque del agente (icono, modelo, transcript) lleva "Run on Start" dentro
- [ ] Tab de OpenCode: bloque de agente con "Copy Session ID" y "Run on Start" dentro, sin acciones de transcript
- [ ] Restaurar un tab de OpenCode sin escribir nada en el: en dev no sale el aviso "did not report a session"
- [ ] Tab de terminal sin agente: "Run on Start" sigue ahi

## Bloque J - Subagentes

### J1 OMP

- [ ] En un tab de `omp`, pedir: "usa la herramienta task para lanzar dos subagentes en paralelo con las descripciones Contar archivos y Saludar"
- [ ] Esperado: en la lista anidada del WorkspaceBar aparecen dos filas hijas del tab, cada una con su nombre, mientras corren, y desaparecen al terminar
- [ ] El tab sigue con spinner mientras haya subagentes corriendo y solo pasa a atencion cuando el ultimo termina
- [ ] "Run on Start" y el icono del tab siguen mostrando la sesion principal, no la de un subagente

### J2 OpenCode

- [ ] En un tab de `opencode`, pedir lo mismo con la herramienta task
- [ ] Esperado: una fila hija por subagente con la descripcion que se le dio (sin el sufijo `(@general subagent)`), que desaparece al terminar
- [ ] Un subagente que falla cierra su fila y no marca error en el tab

### J3 Pi

- [ ] Pedir a `pi` que lance un subagente: responde que no tiene herramienta para ello. No aparece ninguna fila

### J4 Permisos desde un subagente

- [ ] En OMP u OpenCode con una herramienta en modo "ask", pedir un subagente que la use: el tab pasa a atencion aunque la pregunta la haga el subagente

## Bloque K - Codex

Este bloque prueba la integracion de Codex: Kex escribe sus handlers en `hooks.json`, los marca como confiables en
`config.toml` (Codex no ejecuta un handler que no sea de confianza) y restaura las sesiones desde los rollouts.
Diseno en `docs/AGENT_SESSION_RESTORE.md`, seccion "Codex hooks".

**Que NO estaba verificado contra un Codex real cuando se escribio este bloque.** La maquina de desarrollo no tenia
credenciales de Codex (`codex login status` decia "Not logged in" y `codex exec` arrancaba pero fallaba con
`401 Unauthorized`), asi que no se pudo ejecutar ninguna sesion con modelo. Lo comprobado fue solo lo que no necesita
turno: los tests unitarios de Rust y de frontend, y el calculo del hash de confianza, que reproduce los 10 hashes reales
de un `config.toml` de Orca. Por tanto, los pasos K3 a K12 describen lo que el codigo hace por diseno, no algo visto
funcionando con Codex, y quien los ejecute con una cuenta de Codex es quien los verifica por primera vez: debe anotar
cualquier diferencia, en especial los eventos que Codex emite de verdad y la forma de su payload. Los pasos K1, K2, K13
y K14 (instalar, estados bloqueados, convivencia y quitar) no necesitan sesion y se pueden probar sin login. K15 lista
lo que sigue abierto.

Para no tocar la configuracion real mientras se prueba, lanzar Kex y Codex con una copia: `CODEX_HOME=/tmp/codex-copy`
(Kex lee `CODEX_HOME` de su propio entorno, asi que hay que arrancar Kex desde una shell que lo exporte, no desde el Dock).

### K1 Instalar desde Settings y desde el campanazo

- [ ] Con `~/.codex` existente (ejecutar `codex` una vez antes) y sin handlers de Kex: Settings > General > Agents > Codex muestra "Install" y los ficheros `~/.codex/hooks.json, ~/.codex/config.toml`; el campanazo ofrece "Install Codex integration"
- [ ] "Preview" abre el diff con una pestana por fichero (`hooks.json`, `config.toml` y `trigger-event.sh` si no estaba instalado). Ninguna pestana lleva nota; el diff de `hooks.json` solo muestra lineas anadidas (nunca cambios de indentacion o de espacios en lo que no es de Kex)
- [ ] Instalar. Esperado en `hooks.json`: seis handlers (`SessionStart`, `UserPromptSubmit`, `Stop`, `PermissionRequest`, `SubagentStart`, `SubagentStop`) cuyo comando es `[ -n "$KEX_TAB_ID" ] && "$HOME/.config/kex/hooks/trigger-event.sh" codex || true  # kex-session-hook`
- [ ] Esperado en `config.toml`: seis tablas `[hooks.state."<ruta de hooks.json>:<evento>:<grupo>:<handler>"]` con `trusted_hash = "sha256:..."`
- [ ] `head -2 ~/.config/kex/hooks/trigger-event.sh` muestra `# kex-session-v13`
- [ ] Reiniciar Kex: el campanazo ya no ofrece Codex y la fila de Settings dice "Installed"
- [ ] Instalar otra vez (o reiniciar): idempotente, ni `hooks.json` ni `config.toml` cambian (`shasum` antes y despues)

### K2 Estados bloqueados

- [ ] Malformed: con `CODEX_HOME` apuntando a una copia, romper la sintaxis de `hooks.json` a mano (quitar una llave). La fila de Settings dice "Cannot read config", explica que Kex no puede leerlo y lo deja intacto, y solo ofrece "Check again" (sin Install, Uninstall ni Preview). El campanazo muestra una fila "Codex integration unavailable" sin boton
- [ ] Arreglar el fichero y pulsar "Check again": la fila vuelve a su estado normal sin reiniciar. Repetir rompiendo `config.toml`
- [ ] Con un `hooks.json` roto, reiniciar Kex con Codex marcado como instalado: el fichero no se reescribe y Codex sigue en `installedIntegrations` de `settings-general.json` (el log dice que se salta); al arreglarlo, el siguiente arranque lo refresca
- [ ] Cannot edit config: con Kex instalado, convertir a mano una tabla de Kex de `config.toml` en tabla en linea bajo `[hooks.state]` (`"<clave>" = { enabled = true, trusted_hash = "..." }`). El fichero sigue siendo TOML valido. La fila de Settings dice "Cannot edit config" (no "Cannot read config"), explica que Kex no puede editar `config.toml` con seguridad y lo deja intacto, y solo ofrece "Check again". El campanazo dice que Kex no puede editar su `config.toml`
- [ ] Unavailable: con `CODEX_HOME` apuntando a una carpeta que no existe (o sin `~/.codex`), la fila dice "Not found" y solo ofrece "Check again"; el campanazo no muestra Codex. Kex no crea la carpeta
- [ ] Outdated: cambiar a mano el comando de un handler de Kex en `hooks.json`. La fila vuelve a ofrecer Install, que lo repara (y el siguiente arranque de Kex tambien lo repara solo, porque Codex sigue en `installedIntegrations`)

### K3 SessionStart: aparece el icono

- [ ] Abrir `codex` en un terminal de Kex (con la confianza ya instalada)
- [ ] Esperado: el icono de Codex aparece en el tab antes de escribir ningun prompt
- [ ] `agent-sessions.json`: entrada del tab con `agent: "codex"`, `session_id` UUID, `cwd_launch` el directorio de lanzamiento y `launch_cmd: "codex"`; `transcript_path` apunta a `<CODEX_HOME o ~/.codex>/sessions/AAAA/MM/DD/rollout-...-<uuid>.jsonl` o va vacio (ver K15)
- [ ] El icono no sale tachado ("Launch command unknown")
- [ ] Si Codex pregunta si confiar en los hooks al arrancar, anotarlo: Kex ya los dejo de confianza y no deberia

### K4 Estados working, attention e idle

- [ ] Escribir un prompt: el spinner del tab gira mientras Codex trabaja
- [ ] Al terminar el turno el tab pasa a atencion una sola vez (punto ambar) y se apaga al enfocarlo
- [ ] Una accion que pida permiso (un comando fuera del sandbox, con aprobaciones activadas): el tab pasa a atencion mientras el permiso espera, y vuelve a trabajando al aprobarlo

### K5 Subagentes

- [ ] Pedir a Codex una tarea que lance subagentes, si la version instalada los anuncia (`SubagentStart` / `SubagentStop`)
- [ ] Esperado: una fila hija del tab en el WorkspaceBar por subagente, que desaparece al terminar; el tab sigue con spinner mientras haya alguno y pasa a atencion solo cuando acaba el ultimo
- [ ] Si Codex no emite esos eventos no hay filas hijas, y eso no es un fallo de Kex; anotar la version de Codex

### K6 Menu del tab

- [ ] Tab de Codex con rollout: el bloque del agente ofrece "Copy Session ID", "Run on Start" y las acciones de transcript ("Open Transcript Folder", "Reveal Transcript in Finder")
- [ ] Tab de Codex cuyo frame llego con `transcript_path` vacio o `null`: "Copy Session ID" y "Run on Start" siguen, y las acciones de transcript no aparecen (ni "Transcript not created yet")
- [ ] "Run on Start" muestra `codex resume '<uuid>'`, o `<launcher> resume '<uuid>'` si se lanzo con un wrapper reconocido

### K7 Cerrar Kex con Codex abierto y reabrir

- [ ] Con una sesion de Codex que ya intercambio al menos un mensaje, cerrar Kex (Cmd+Q) y reabrirlo
- [ ] Esperado: el tab se abre en el directorio del rollout y Kex escribe `codex resume '<uuid>'` (precedido de las variables o el wrapper del lanzamiento original, pero sin flags: la lista de flags conservados de Codex esta vacia)
- [ ] La sesion continua: es la misma conversacion, no una nueva, y el `session_id` de `agent-sessions.json` no cambia
- [ ] `codex -p work` (perfil, no print mode) tambien se restaura; `codex resume <id>` lanzado a mano tambien

### K8 Hibernar y despertar

- [ ] Con un tab de Codex en un workspace, hibernarlo (Cmd+Alt+Z) y despertarlo
- [ ] Esperado: al despertar el icono aparece antes de escribir nada y Kex escribe `codex resume '<uuid>'`

### K9 `codex exec` no se restaura

- [ ] En un tab, `codex exec "di hola"` y luego `codex e "di hola"`: no sale icono de agente (ni tachado) y `agent-sessions.json` no gana entrada
- [ ] Con el log en nivel debug, al acabar el comando aparece `print run ended`
- [ ] `codex -c model=o3 exec "hola"` tambien se filtra; `codex -m exec` (un modelo llamado exec) no es un exec

### K10 Sesion sin rollout

- [ ] Abrir `codex` y cerrar el tab sin escribir ningun prompt, luego reabrir Kex
- [ ] Esperado por diseno: la entrada del store sigue ahi y Kex escribe `codex resume '<uuid>'` en el directorio grabado. Lo que Codex responde a un id sin rollout no estaba verificado: si dice que no encuentra la sesion, anotarlo; el arreglo previsto es pasar la fila de Codex a `KeepWithoutPlan` (una linea en `provider.rs`)

### K11 Rollout buscado por id

- [ ] Con `CODEX_HOME` exportado solo en la shell y Kex arrancado desde el Dock: la busqueda por id no ve la carpeta, pero el `transcript_path` del frame (si Codex lo envio) basta para restaurar; si iba vacio la restauracion sigue funcionando (`ResumeAnyway`) con el directorio de lanzamiento grabado
- [ ] Con muchos rollouts en `sessions/`, reabrir Kex no se nota mas lento (el recorrido es de tres niveles de fecha, del mas reciente al mas antiguo, y para en el primer dia que contiene el id)

### K12 Confianza revocada o retocada

- [ ] Con Codex instalado, borrar a mano una tabla `[hooks.state."...:SessionStart:..."]` de `config.toml`. Esperado: la fila pasa a ofrecer Install (estado outdated); Codex no ejecuta ese handler hasta que se repare, y el siguiente arranque de Kex lo repara solo
- [ ] Poner `enabled = false` en una de las tablas de Kex y reinstalar: la tabla conserva `enabled = false` mientras su clave no cambie
- [ ] Mover un grupo de `hooks.json` para que cambie la posicion de un handler de Kex y reinstalar: la tabla de la posicion vieja se elimina y aparece la de la nueva

### K13 Convivencia con Orca y Kaji

- [ ] Con los handlers de Orca y de Kaji ya en `hooks.json` y sus tablas `[hooks.state."..."]` en `config.toml`, guardar una copia de ambos ficheros y luego instalar Codex desde Kex
- [ ] Esperado: cada handler ajeno sigue igual como JSON (comparar con `jq -S .` los que no llevan `# kex-session-hook`, antes y despues), en el mismo orden dentro de su evento, y `config.toml` solo gana las tablas de Kex (`diff` muestra lineas anadidas, ninguna cambiada ni borrada). `hooks.json` conserva byte a byte lo ajeno (espacios, `\/`, indentacion)
- [ ] Desinstalar desde Settings: `hooks.json` queda sin ningun handler con `# kex-session-hook`, las tablas de Kex desaparecen de `config.toml`, y los handlers y las tablas de Orca y Kaji siguen identicos
- [ ] Si Orca o Kaji escriben el fichero mientras Kex instala, el plan se rehace (hasta tres intentos) sin perder lo suyo

### K14 Desinstalar

- [ ] Settings > General > Agents > Codex > Uninstall: la fila pasa a "Not installed", el campanazo vuelve a ofrecer "Install Codex integration", y reabrir Kex no lo reinstala
- [ ] `~/.config/kex/hooks/trigger-event.sh` no se borra (lo comparte Claude Code)

### K15 Comprobaciones que siguen abiertas

Necesitan un Codex con sesion iniciada y no se pudieron medir. Cada una puede cambiar el codigo:

- [ ] **Marcas OSC 133 propias (regla de TASK-851).** Lanzar `codex`, escribir un mensaje y esperar la respuesta: el icono del tab debe seguir ahi y "Run on Start" mantener su comando. Si el tab pierde el agente tras el primer mensaje, Codex dibuja sus propias marcas y `AgentDetector` necesita la regla que OMP ya tiene; salir con `/exit` o Ctrl+D debe apagar el icono. Hoy `AgentDetector` trata a Codex como a cualquier agente
- [ ] **`codex resume <id>` de una sesion sin rollout** (ver K10)
- [ ] **Lista de flags de `codex exec`.** Las opciones de Codex que llevan valor (`-c`, `-m`, `-p`, `-s`, `-a`, `-C`, `-i`, `--add-dir`, `--enable`, `--disable`, `--local-provider`) salieron de la ayuda de la CLI, no de una medicion. Probar `codex <opcion> <valor> exec ...` con cada una y comprobar que se filtra
- [ ] **Payload con `transcript_path` nulo.** Mirar el JSON real que Codex manda en `SessionStart`: si `transcript_path` viene `null` antes del primer mensaje, debe quedar vacio en el store y el menu ocultar las acciones de transcript (K6). Anotar tambien si manda `source` y con que valores
- [ ] **Carpeta de fecha del rollout.** Kex busca el rollout de un id UUIDv7 solo en las carpetas `AAAA/MM/DD` del dia anterior, el mismo y el siguiente a la fecha UTC que lleva el id. Crear una sesion, apuntar su id y la fecha (decodificar los 12 primeros digitos hex del id como milisegundos Unix) y comprobar que el rollout cae en esa ventana. Repetir reanudando la sesion al dia siguiente (`codex resume <id>`): el rollout debe seguir en la carpeta original y no aparecer uno nuevo en la del dia de hoy. Si Codex fecha la carpeta por otro momento, Kex no encuentra el rollout y usa el directorio de lanzamiento guardado
- [ ] **Modelo en vivo.** `live_model` no sabe leer un rollout de Codex, asi que la barra del tab no muestra el modelo. Pendiente de medir
- [ ] **Codex no pide confiar en los hooks al arrancar (K3).** Con la integracion instalada, abrir `codex` por primera vez: no debe preguntar si confia en los hooks de Kex. Si lo pregunta, la tabla `[hooks.state]` que escribe Kex no le basta y hay que revisar el punto siguiente
- [ ] **El hash de confianza con un Codex actual.** Confirmar que tras instalar, Codex ejecuta los seis handlers sin pedir confianza. Si no, el algoritmo de `codex_trust.rs` se ha desviado del de Codex y el unico sintoma es que no llegan eventos

## Bloque L - Recordatorio de instalacion

Prueba como Kex recuerda al usuario que instale la integracion de un agente: un toast, sin ningun marcador en el tab.
Diseno en `docs/NOTIFICATIONS.md`, seccion "Install reminder". El estado vive en `integrationSuggestions` dentro de
`settings-general.json`; para repetir una prueba hay que cerrar Kex, borrar la entrada del agente y volver a abrirlo (la
app mantiene el registro en memoria mientras corre). Usar OMP o Pi para probar sin tocar la config de Claude Code.

### L1 Primera vez

- [ ] Sin la integracion de Pi instalada y sin entrada `pi` en `integrationSuggestions`, abrir Kex y lanzar `pi` en un tab
- [ ] Esperado: sale un toast "Pi is running without the Kex integration" con un unico boton, Install, y la X de cerrar. El tab NO lleva ningun icono extra
- [ ] `settings-general.json` ahora tiene `"pi": { "asks": 1, "lastAskedAt": <ahora>, "installedOnce": false }`
- [ ] Lanzar `pi` en un segundo tab: no sale otro toast

### L2 Install y cerrar

- [ ] Install: se instala, sale "Pi integration installed" y `installedOnce` pasa a `true`
- [ ] Cerrar el toast con la X o dejar que pasen 20 s cuenta como "ahora no": la entrada sigue en `asks: 1`
- [ ] Tras cerrarlo no queda nada en el tab que avise de que falta la integracion; se instala desde Settings > General > Agents o desde el campanazo

### L3 Segunda y ultima vez

- [ ] Con la entrada `pi` en `asks: 1`, reabrir Kex y lanzar `pi`: no sale el toast
- [ ] Cerrar Kex, poner `lastAskedAt` 16 dias atras (`date -v-16d +%s000` da los milisegundos), abrir Kex y lanzar `pi`: sale el toast y `asks` pasa a 2
- [ ] Repetir con `lastAskedAt` aun mas antiguo y `asks: 2`: no sale nunca mas

### L4 Instalada una vez, no se vuelve a preguntar

- [ ] Instalar Pi desde Settings, desinstalarlo y borrar `asks`/`lastAskedAt` a mano dejando `installedOnce: true`: al lanzar `pi` no sale el toast
- [ ] Integracion ya instalada antes de esta funcion (sin entrada en `integrationSuggestions`): al lanzar el agente no sale nada y la entrada pasa a `installedOnce: true`
- [ ] Una entrada antigua con `"markerDismissed": true`: se ignora, y tras la siguiente escritura de esa entrada el campo ya no esta

### L5 Estados que bloquean

- [ ] Con un `~/.codex/config.toml` que Kex no sabe leer, lanzar `codex`: no sale el toast y `integrationSuggestions` no gana la entrada `codex`. Arreglar el fichero y repetir: sale el toast
- [ ] Sin carpeta de Codex (`CODEX_HOME` apuntando a una ruta que no existe), lanzar `codex`: tampoco sale nada, porque el estado es `unavailable`
- [ ] Con Claude Code: como `agentNotifications` esta activado por defecto, Kex instala los hooks solo al arrancar y el recordatorio no sale. Para verlo hay que desactivar el ajuste (o borrar a mano las entradas `kex-session-hook` de `~/.claude/settings.json` con el ajuste apagado), reabrir Kex y lanzar `claude`
- [ ] `claude -p "hola"` (modo no interactivo) no dispara el recordatorio: el detector lo salta
- [ ] Lanzar un agente sin integracion en Kex (por ejemplo `gemini`): no sale nada

## Bloque M - Avisos de atencion: toast, aviso del sistema y campana

Prueba lo que ve el usuario cuando un agente necesita algo. Diseno y tabla completa en `docs/NOTIFICATIONS.md`,
seccion "Resumen: todos los avisos". Necesita la integracion del agente instalada (Claude Code lo esta por defecto).
Usar Claude Code: para forzar un aviso de atencion basta pedirle algo que requiera permiso (por ejemplo `escribe un
fichero /tmp/x`) con los permisos en modo "preguntar".

### M1 Si estas mirando el tab, no se avisa

- [ ] Tab del agente activo y ventana de Kex con foco. Pedir algo que pida permiso
- [ ] Esperado: no sale toast, ni aviso del sistema, ni fila nueva en la campana, ni punto ambar en el tab

### M2 Toast de atencion (ventana con foco, otro tab)

- [ ] Lanzar la peticion y cambiar a otro tab del mismo workspace antes de que termine
- [ ] Esperado: sale un toast "<nombre> needs your input" con boton "Open", el tab del agente lleva punto ambar y la campana suma una fila
- [ ] "Open" lleva al tab y el punto ambar desaparece (mirar el tab lo apaga)
- [ ] Dejar el toast sin tocar: se va solo a los 15 s
- [ ] Un fin de turno normal (sin pedir permiso) produce el mismo aviso, con el mismo titulo "needs your input" (no "finished")

### M3 Aviso del sistema (ventana sin foco)

- [ ] Lanzar la peticion y pasar a otra aplicacion antes de que termine
- [ ] Esperado: notificacion del sistema "<nombre> needs your input". En macOS, un clic en ella trae Kex al frente y activa ese tab; sacarla de otro modo (volver a Kex a mano) no navega
- [ ] No sale toast dentro de Kex mientras la ventana no tiene foco

### M4 Error

- [ ] Provocar un fallo del agente (por ejemplo cortar la red a mitad de turno)
- [ ] Esperado: aviso del sistema o fila de campana "<nombre> stopped with an error", y nunca toast dentro de Kex

### M5 Campana

- [ ] Abrir con el icono del header y con Cmd+Shift+I (o el atajo reasignado en Settings > Shortcuts)
- [ ] Una fila por tab con el mismo indicador que el tab; el numero de la campana cuenta los pendientes y se pone a cero al abrir
- [ ] "Clear all" borra las filas y apaga los puntos ambar; los tabs con spinner siguen girando

### M6 Spinner y subagentes

- [ ] Mandar un prompt: el tab gira. Pulsar ESC una vez: deja de girar
- [ ] Mandar un prompt que lance un subagente en segundo plano y esperar a que el agente principal termine su turno: el tab SIGUE girando y no sale el punto ambar hasta que acaba el subagente y llega su propio fin de turno
- [ ] Cambiar Settings > Appearance > spinner (`arc`, `cursor`, `bar`, ...): el tab cambia de rueda sin reiniciar

### M7 Apagar los avisos

- [ ] No hay ningun interruptor de avisos en Settings. Comprobarlo: Settings > General no tiene "Coding agent notifications"
- [ ] Desinstalar la integracion de Claude Code (Settings > General > Agents > Uninstall) pone `agentNotifications` a `false`: dejan de salir toast, aviso del sistema y filas de campana, y tambien el spinner y los puntos, porque sin hooks Kex ya no se entera de nada
- [ ] Reinstalarla lo devuelve a `true`

---

## Checklist de diagnostico rapido (en caso de que no restaure)

```
[ ] echo $KEX_PANEL_ID  →  UUID no vacio
[ ] ls -la ~/.config/kex/hooks/session.sh  →  existe, permisos 755
[ ] cat ~/.claude/settings.json | grep kex-session-hook  →  aparece
[ ] cat ~/Library/Application Support/app.betauer.kex/agent-sessions.json  →  existe, state: "idle", session_id relleno
[ ] find ~/.claude/projects -name "<session_id>.jsonl"  →  archivo encontrado
[ ] tabId en agent-sessions.json == id del tab en workspaces/<id>.json
```

El ultimo punto (tabId == tab.id) es el mas critico. Si los IDs no coinciden,
el restore plan existe pero `consumeRestorePlan` no lo encuentra porque busca por el
nuevo tab ID, que es diferente al guardado en el store.

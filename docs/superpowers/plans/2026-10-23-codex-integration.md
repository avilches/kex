# Plan: integracion de Codex

Spec (autoridad): `docs/superpowers/specs/2026-10-23-codex-integration-design.md`. Tarea de tablero: TASK-756.
Documentacion de referencia que todo implementador debe leer antes de empezar: `docs/AGENT_SESSION_RESTORE.md`
(como se hicieron OpenCode, OMP y Pi), `src-tauri/src/modules/agent/{provider.rs,mod.rs,session_store.rs,launch_cmd.rs}`,
`src-tauri/src/modules/agent/hooks/trigger-event.sh`, `src-tauri/src/modules/pty/ipc.rs`, `src/modules/agents/lib/integrations.ts`.

## Global Constraints

- Proyecto Kex, convenciones de `CLAUDE.md`: sin em-dash ni emojis en ningun sitio, comentarios solo si explican el porque
  (1-2 lineas), imports `@/...` en frontend, pnpm nunca npm, mensajes de commit en ingles, de una sola linea, sin
  `Co-Authored-By` ni mencion a Claude. Commits atomicos.
- Sin compatibilidad hacia atras: nada de migraciones ni shims.
- Logica nueva en funciones puras y pequenas (functional core); comandos Tauri y componentes finos.
- Trabajar solo en este worktree (`.claude/worktrees/codex-integration`). NUNCA cambiar de rama el checkout principal.
- NUNCA modificar `~/.codex/hooks.json`, `~/.codex/config.toml` ni ningun otro fichero real de `$HOME` desde codigo de
  prueba o mediciones. Para medir Codex real, usar un `CODEX_HOME` temporal copiado (ver Task 1). Los tests usan
  directorios temporales.
- Los hooks de Orca y Kaji de `~/.codex/hooks.json` no se tocan jamas: Kex solo toca los suyos (marcador `# kex-session-hook`).
- Verificacion antes de dar una tarea por hecha: `pnpm lint`, `pnpm check-types`, `pnpm test` (lo que toque frontend) y
  `cd src-tauri && cargo clippy && cargo test --locked` (lo que toque Rust). Una tarea de subsistema nucleo lleva un
  test que fija la invariante.
- Documentacion viva (`docs/IPC.md`, `docs/AGENT_SESSION_RESTORE.md`, etc.) se actualiza en el mismo commit que el cambio.
- Si un hecho medido contradice el spec, el implementador lo anota en su informe y sigue con lo medido; el controlador
  decide.

### Task 1: Medir Codex real y registrar los hechos

Sin codigo de producto. Producir `docs/superpowers/specs/2026-10-23-codex-measurements.md` y un directorio de fixtures
`src-tauri/tests/fixtures/codex/` con muestras anonimizadas (sin rutas personales ni contenido de conversaciones).

Metodo: crear `CODEX_HOME=$(mktemp -d)` copiando de `~/.codex` solo lo imprescindible para autenticarse y arrancar
(`config.toml` sin `[hooks.state]`; no copiar `hooks.json`; no copiar historiales ni sesiones). Escribir en ese
`CODEX_HOME` un `hooks.json` con un hook de volcado (`cat >> $DUMP/<evento>.jsonl`) para estos eventos: `SessionStart`,
`UserPromptSubmit`, `Stop`, `PermissionRequest`, `SubagentStart`, `SubagentStop`, `PreToolUse`, `PostToolUse`, y confiarlo
con `--dangerously-bypass-hook-trust` solo en esa invocacion. Si Codex no puede autenticarse en un `CODEX_HOME`
temporal, parar y devolver BLOCKED explicando que falta.

Medir y registrar: (a) payload completo de cada evento y los valores de `source` de `SessionStart` (startup, resume, clear,
compact); (b) si `transcript_path` llega nulo antes del primer mensaje y cuando aparece el fichero
`rollout-*.jsonl`; (c) si existe `SessionEnd`; (d) si `codex exec` dispara `SessionStart` y con que `source`;
(e) si Codex dibuja marcas OSC 133 propias (ejecutarlo bajo `script -q /dev/null` o un pty y buscar `\x1b]133;`);
(f) con que cwd arranca desde `$HOME`; (g) formato de `session_meta` (linea 1 del rollout) y como se compara la
cadena `codex resume <id>` con el id del nombre de fichero; (h) generar con `/hooks` o equivalente una entrada
`[hooks.state."..."]` real para un hook de prueba y guardar el `trusted_hash` junto con la definicion exacta del hook
(comando, timeout, matcher, statusMessage, async) en el fixture, para que la Task 3 pueda verificar el algoritmo;
(i) si hay subagentes y por que evento llegan.

Criterio de aceptacion: el documento responde a (a) a (i) con evidencia (fragmentos de salida), y los fixtures existen.

### Task 2: Resume por id en la fila `codex`

Fichero: `src-tauri/src/modules/agent/provider.rs`. Hoy la fila `codex` usa `ResumeSpec::Last` y el test
`resume_cmd_codex` espera `codex resume --last`. Codex 0.163 acepta `codex resume <SESSION_ID>`.

Primero cambiar el test: `Provider::of("codex").unwrap().resume_cmd(None, "abc-123")` debe dar `codex resume 'abc-123'` (id
entrecomillado como el resto de agentes) y `resume_cmd(Some("codex-max"), "abc-123")` debe dar
`codex-max resume 'abc-123'`. Ver que falla. Despues anadir la variante de `ResumeSpec` que haga falta (subcomando
posicional, por ejemplo `Subcommand { name: "resume" }`) o el mecanismo mas sencillo que encaje con como se escribe el
resto de variantes, actualizar la fila y el comentario que la acompana, y mantener la politica
`MissingTranscriptPolicy::ResumeAnyway`. Revisar todos los usos de `ResumeSpec::Last` y las pruebas de otras partes
(`session_store.rs`, `launch_cmd.rs`) que dependan del comportamiento anterior. Actualizar `docs/AGENT_SESSION_RESTORE.md`
si menciona `--last`.

Criterio de aceptacion: `cargo test --locked` y `cargo clippy` en verde; ningun uso restante de `--last` para codex.

### Task 3: Modulo puro `codex_trust` (hash, clave y edicion del TOML)

Nuevo `src-tauri/src/modules/agent/codex_trust.rs`, sin I/O de red ni de Tauri, solo funciones puras sobre strings mas una
funcion fina de escritura atomica. Referencia del algoritmo (solo lectura, fuera del repo): Orca en
`~/Work/Proy/Repos/orca/src/main/codex/codex-trust-identity.ts`, `config-toml-trust.ts`,
`config-toml-hook-trust-edit.ts`, `config-toml-hook-trust-read.ts`, `config-toml-syntax.ts`,
`config-toml-atomic-write.ts`. Portar a Rust: `trust_key(source_path, event, group, handler)`,
`trusted_hash(entry)` (sha256 hexadecimal con prefijo `sha256:`; mirar que crate de hash ya esta en `Cargo.toml` y
reutilizarlo antes de anadir ninguno), `upsert_hook_trust(content, entries) -> String` y
`remove_hook_trust(content, keys) -> String`. La edicion toca solo las tablas `[hooks.state."<clave>"]` de Kex y
conserva byte a byte el resto del fichero (comentarios, orden, finales de linea).

Tests: el hash calculado coincide con el `trusted_hash` real de los fixtures de la Task 1; round trip upsert-remove deja el
fichero identico; un `config.toml` con otras tablas, comentarios y las entradas de Orca y Kaji queda intacto salvo las
lineas de Kex; idempotencia; escritura atomica en directorio temporal.

Criterio de aceptacion: tests en verde, clippy limpio, y el hash verificado contra al menos un fixture real. Si el
algoritmo no se puede reproducir, devolver BLOCKED con lo averiguado.

### Task 4: Modulo puro `codex_hooks` (hooks.json de Kex)

Nuevo `src-tauri/src/modules/agent/codex_hooks.rs`. Funciones: `install(hooks_json: &str, script_path) -> (String,
Vec<TrustEntry>)`, `remove(hooks_json) -> String`, `status(hooks_json, script_path) -> Status` (instalado, al dia,
obsoleto). Inserta un handler `command` de Kex en cada evento util (`SessionStart`, `UserPromptSubmit`, `Stop`,
`PermissionRequest`, `SubagentStart`, `SubagentStop`, los que la Task 1 confirme) con el mismo comando que usa Claude
(`[ -n "$KEX_TAB_ID" ] && "$HOME/.config/kex/hooks/trigger-event.sh" || true  # kex-session-hook`), timeouts en segundos,
y devuelve el grupo y handler reales donde ha quedado para que la Task 3 calcule las claves. No toca ningun handler ajeno.
El JSON se reescribe preservando el orden y el formato de las claves existentes en la medida que `serde_json` con
`preserve_order` lo permita; si el crate no lo tiene activo, decidir y justificar.

Tests: insertar en un `hooks.json` real (fixture con Orca y Kaji) deja los handlers ajenos identicos; idempotente;
`remove` solo quita lo de Kex; `status` detecta un script obsoleto.

Criterio de aceptacion: tests y clippy en verde.

### Task 5: Script de eventos para Codex

`src-tauri/src/modules/agent/hooks/trigger-event.sh`: hoy etiqueta todo con `"agent": "claude"`. Debe etiquetar con
`"agent": "codex"` cuando el evento viene de Codex. Decidir el mecanismo mas simple y robusto segun los payloads medidos
en la Task 1 (por ejemplo, un argumento del comando de hook o la presencia de una variable que Codex exporte), subir el
marcador a `kex-session-v8`, y mantener el comportamiento de Claude intacto. Ajustar `agent_claude_hooks_status` para que
los usuarios con `v7` vean el boton de reinstalar, como ya se hizo en versiones anteriores, y actualizar los tests y
`docs/AGENT_SESSION_RESTORE.md`. Si el payload de Codex difiere (por ejemplo `transcript_path` nulo), normalizarlo en el
script, no en Rust.

Criterio de aceptacion: tests del script (los que ya existan para `trigger-event.sh`, ampliados) en verde.

### Task 6: Comandos Tauri e integracion generica

En `src-tauri/src/modules/agent/mod.rs` y `src-tauri/src/lib.rs`: `agent_setup_codex`, `agent_codex_status`, la rama `codex`
en `integration_target`, `agent_sync_integrations`, `agent_remove_integration` (solo los tres existentes mas codex, nunca
otro nombre) y `agent_integration_preview` (diff de `hooks.json` y `config.toml`). Orquestan Task 3 y Task 4: leer, calcular,
escribir con rename atomico. Un `hooks.json` o `config.toml` que no se pueda parsear se deja intacto y el agente sale de
`installedIntegrations`, como ya se hace con los ficheros sin marcador. Desinstalar quita hooks y entradas de confianza
de Kex y nada mas. Comprobar que existe el script `trigger-event.sh` y reinstalarlo si falta.

Documentar los comandos en `docs/IPC.md`. Tests de integracion con `HOME` y `CODEX_HOME` temporales (respetar
`CODEX_HOME` si esta definido, como hace Codex).

Criterio de aceptacion: tests y clippy en verde; instalar, sincronizar y desinstalar sobre un `hooks.json` con Orca y Kaji
deja intactos sus handlers y sus entradas de confianza.

### Task 7: Ingesta de eventos de Codex y restauracion

`src-tauri/src/modules/pty/ipc.rs`, `agent/session_store.rs`, `agent/provider.rs`, `agent/launch_cmd.rs`:
aceptar `agent: "codex"` en `SessionStart` y en los demas eventos; grabar `session_id`, `transcript_path`, `cwd` y
`launch_cmd`. Anadir `SessionsSource::CodexSessions` (busqueda del uuid en el nombre `rollout-*-<uuid>.jsonl` bajo
`<CODEX_HOME o ~/.codex>/sessions/**`) y `CwdRead::HeaderLine(1)` sobre `session_meta.payload.cwd`. Politica de
transcript ausente segun lo medido en la Task 1. Filtrar `codex exec` y su alias `e` para que no se registre como sesion
a restaurar, siguiendo como se filtra `claude -p`. Si la Task 1 midio marcas OSC 133 propias, aplicar la regla de TASK-851 en
`pty/agent_detect.rs` con su test. `live_model.rs`: entender las lineas de Codex solo si el JSONL lo permite sin coste.

Tests: un `SessionStart` de Codex graba el registro completo; el plan de restauracion encuentra el rollout por id con un
arbol temporal; `codex exec` no registra; la tabla `Provider` sigue sincronizada con `DEFAULT_AGENTS`.

Criterio de aceptacion: tests y clippy en verde, `docs/AGENT_SESSION_RESTORE.md` con la seccion "Codex hooks".

### Task 8: Frontend

`src/modules/agents/lib/integrations.ts` (entrada `codex`), `agentIcon.tsx` (icono monocromo inline, nunca `img` con
`currentColor`), `src/settings/sections/AgentIntegrations.tsx` y la campana (`NotificationBell.tsx`): fila de Codex con
Install/Uninstall y "View changes" como diff de ambos ficheros; `installedIntegrations` admite `codex`; menu del tab
(`workspaces/lib/agentMenu.ts`): Copy Session ID, Run on Start y Reveal Transcript. Seguir el patron de OMP y Pi y
reutilizar sus tests (`integrations.test.ts`, `agentIcon.test.tsx`, `agentMenu.test.ts`,
`AgentIntegrationRow.test.tsx`). Subagentes: test de que `SubagentStart/Stop` de Codex llegan como los de Claude.
Respetar `docs/SETTINGS_UI.md` y shadcn.

Criterio de aceptacion: `pnpm lint`, `pnpm check-types`, `pnpm test` en verde.

### Task 9: Plan de pruebas manuales y documentos

Bloque Codex en `docs/RESTORE_SESSION_TESTS.md` (instalacion, `SessionStart`, restore, hibernacion, subagentes,
confianza revocada, convivencia con Orca y Kaji), actualizar `docs/AGENT_SESSION_RESTORE.md`, `docs/ARCHITECTURE.md` y
`docs/FORK.md` si procede. Si algo costo mas de un intento, entrada en el GOTCHAS correspondiente.

Criterio de aceptacion: los documentos describen lo medido, no lo supuesto, y no contienen em-dash.

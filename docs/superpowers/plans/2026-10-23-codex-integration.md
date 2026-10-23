# Plan: integracion de Codex

Diseno: `docs/superpowers/specs/2026-10-23-codex-integration-design.md`. Tarea: TASK-756. Un commit atomico por paso;
tests antes del codigo; al acabar, `pnpm lint`, `pnpm check-types`, `pnpm test`, `cargo clippy`, `cargo test --locked`.

## Fase 0 - Medir (sin tocar codigo del producto)

1. Lanzar `codex` en un terminal de Kex dev con un hook de volcado temporal y anotar en el doc de investigacion: payload
   real de cada evento (`SessionStart` con sus `source`, `UserPromptSubmit`, `Stop`, `PermissionRequest`,
   `SubagentStart/Stop`), si `transcript_path` llega nulo, y si hay `SessionEnd`.
2. Comprobar cuando aparece el fichero `rollout-*.jsonl` (al arrancar o con el primer mensaje).
3. Comprobar si `codex exec` dispara `SessionStart` y como lo ve el detector OSC.
4. Comprobar si Codex dibuja marcas OSC 133 propias (TASK-851).
5. Comprobar con que cwd arranca desde la carpeta personal.
6. Generar una entrada de confianza real desde `/hooks` y comparar con el hash que calcula nuestro codigo (paso 4).

## Fase 1 - Resume por id (independiente, se puede mezclar sola)

1. Test en `provider.rs`: `Provider::of("codex").resume_cmd(None, "abc")` da `codex resume 'abc'` y con binario
   alternativo `codex-max resume 'abc'`. Sustituir `resume_cmd_codex` (hoy espera `--last`).
2. Cambiar la fila `codex` (y la variante de `ResumeSpec` que haga falta). Actualizar el comentario de la fila.
3. Actualizar `docs/AGENT_SESSION_RESTORE.md` y `docs/RESTORE_SESSION_TESTS.md`.

## Fase 2 - Hooks y confianza (Rust)

1. Modulo puro `agent/codex_trust.rs`: calculo del hash y de la clave `hooks.json:<evento>:<g>:<h>`, y edicion de
   `config.toml` preservando bytes ajenos (upsert y remove). Tests con fixtures reales de Fase 0 y de `~/.codex/config.toml`.
2. Modulo puro `agent/codex_hooks.rs`: insertar/quitar los hooks de Kex en `hooks.json` sin tocar los de Orca ni Kaji;
   idempotente; detecta si esta al dia.
3. Comandos Tauri `agent_setup_codex`, `agent_codex_status`, y la rama `codex` en `integration_target` /
   `agent_sync_integrations` / `agent_remove_integration` / `agent_integration_preview`. Anadir `codex` a la lista
   `installedIntegrations`. Actualizar `docs/IPC.md`.
4. `pty/ipc.rs`: aceptar `agent: "codex"` en `SessionStart` y los demas eventos; test de que se graba `session_id`,
   `transcript_path`, `cwd` y `launch_cmd`.

## Fase 3 - Restauracion

1. `SessionsSource::CodexSessions` (busqueda del uuid bajo `~/.codex/sessions/**`) y `CwdRead::HeaderLine(1)` sobre
   `session_meta.payload.cwd`. Tests con un arbol temporal.
2. Politica de transcript ausente segun Fase 0 (`ResumeAnyway` probable).
3. Filtro de `codex exec` (y `e`) para no registrar ejecuciones no interactivas; test en `launch_cmd.rs`.
4. `live_model.rs`: entender las lineas de Codex para el modelo vivo si el JSONL lo permite (opcional, se decide en Fase 0).

## Fase 4 - Frontend

1. `integrations.ts`: entrada `codex` (nombre, icono, comandos); tests de `integrations.test.ts`, `agentIcon.test.tsx`.
2. Icono monocromo inline en `agentIcon.tsx`.
3. Fila en Settings > General > Agents (`AgentIntegrations`) y en la campana, con "View changes" como diff de
   `hooks.json` y `config.toml`.
4. Menu del tab (`agentMenu.ts`): "Copy Session ID", "Run on Start", "Reveal Transcript".
5. Subagentes: `SubagentStart/Stop` ya llegan como en Claude; test de integracion en `subagentGate.test.ts`.

## Fase 5 - Deteccion y casos raros

1. Si Codex dibuja OSC 133 propias, aplicar la regla de TASK-851 (ignorar `D` pegado a `C`) y anadir test en
   `agent_detect.rs`.
2. Cwd al lanzar desde la carpeta personal, si difiere.

## Fase 6 - Verificacion y documentos

1. Bloque Codex en `docs/RESTORE_SESSION_TESTS.md` (instalacion, SessionStart, restore, hibernacion, subagentes,
   confianza revocada).
2. `docs/AGENT_SESSION_RESTORE.md`: seccion "Codex hooks"; `docs/ARCHITECTURE.md` y `docs/FORK.md` si cambian.
3. Prueba manual real (AC 5 de TASK-756): cerrar Kex con Codex corriendo, reabrir, comprobar que reanuda la sesion correcta.
4. Si el diagnostico costo mas de un intento, entrada en `docs/PTY_GOTCHAS.md` o un GOTCHAS nuevo.

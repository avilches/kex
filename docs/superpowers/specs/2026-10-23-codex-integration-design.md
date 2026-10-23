# Integracion de agente: Codex (diseno)

Estado: borrador pendiente de aprobacion. Tarea: TASK-756. Investigacion previa: `backlog/docs/agent-integration/doc-1`.
Plan de implementacion: `docs/superpowers/plans/2026-10-23-codex-integration.md`.

## Objetivo

Que un tab de Kex con Codex (OpenAI) corriendo se comporte como uno con Claude Code, OpenCode, OMP o Pi: icono y
estado vivos (working, attention, idle), notificaciones, subagentes, menu del tab y restauracion de la sesion exacta al
reabrir Kex o despertar un workspace hibernado.

No objetivos: Gemini CLI y Antigravity (`agy`) quedan para mas tarde (TASK-757 y la tarea nueva de Antigravity); no se
toca la config de proyecto de Codex (`<repo>/.codex/`), solo la de usuario; no hay migraciones ni compatibilidad.

## Medido en esta maquina (codex-cli 0.163.0)

- `codex resume [SESSION_ID] [PROMPT]` acepta un UUID o un nombre de sesion. `--last` reanuda lo ultimo de cualquier
  proyecto. La fila actual de Kex (`ResumeSpec::Last`) es por tanto un bug: ignora el id del tab.
- Hay hooks nativos (`features list`: `hooks` estable). `~/.codex/hooks.json` ya los usa para Orca y Kaji con los eventos
  `Interrupt`, `PermissionRequest`, `PostToolUse`, `PreToolUse`, `SessionStart`, `Stop`, `SubagentStart`, `SubagentStop` y
  `UserPromptSubmit`. Es decir, Codex trae casi todos los eventos que Kex ya traduce desde Claude, subagentes incluidos.
- Un hook no gestionado solo corre si esta confiado: `config.toml` guarda
  `[hooks.state."<ruta hooks.json>:<evento>:<grupo>:<handler>"]` con `trusted_hash = "sha256:..."` y `enabled`. El
  algoritmo del hash esta en Orca (`src/main/codex/codex-trust-identity.ts`, `config-toml-trust.ts`). Alternativa
  descartada: `--dangerously-bypass-hook-trust`, porque Kex no controla como lanza el usuario `codex`.
- Los transcripts son `~/.codex/sessions/AAAA/MM/DD/rollout-<fecha>-<uuid>.jsonl`, por fecha y no por proyecto. La linea 1
  es `{type:"session_meta", payload:{id, cwd, source, ...}}` (`source: "exec"` en las ejecuciones no interactivas).
  `~/.codex/session_index.jsonl` mapea id a nombre del hilo. Hay ademas bases SQLite (`state_5.sqlite`, etc.).
- `codex exec` (alias `e`) es el modo no interactivo.

## Decisiones propuestas

1. **Via de integracion: hooks de `~/.codex/hooks.json`**, no un plugin como en OpenCode/OMP/Pi, porque los eventos ya
   existen y reaprovechan `trigger-event.sh` (mismo formato `session_id`/`transcript_path`/`cwd`). El script se etiqueta
   con `"agent": "codex"`. Mi llamada: si en la fase de medicion el payload de Codex difiere en algo relevante (por
   ejemplo `transcript_path` nulo), se adapta en el script, no en Rust.
2. **Confianza**: Kex escribe en `config.toml` las entradas `hooks.state` con el hash calculado, editando solo sus lineas
   y respetando el resto del TOML byte a byte (como hace Orca). Si el hash cambia al actualizar el script, el sync de
   arranque lo reescribe. Desinstalar quita hooks y entradas de trust propias y nada mas.
3. **Convivencia**: los hooks de Orca y Kaji se quedan intactos; el indice `grupo:handler` de las entradas de trust se
   calcula sobre el `hooks.json` real tras insertar, y los hooks de Kex llevan un marcador (`# kex-session-hook`) para
   reconocerlos, igual que en Claude.
4. **Resume por id**: la fila `codex` pasa de `ResumeSpec::Last` a un resume posicional (`codex resume <id>`). Hace
   falta una variante nueva de `ResumeSpec` para el subcomando posicional, o `Flag` con un subcomando. A decidir en el
   plan tras ver como se escribe la fila.
5. **Transcript**: `sessions` apunta a `~/.codex/sessions/**` buscando por el uuid del nombre de fichero;
   `cwd_read` lee la linea 1 (`session_meta.payload.cwd`). Se mide si Codex difiere la creacion del fichero hasta el
   primer mensaje; si lo hace, politica `ResumeAnyway` igual que Pi.
6. **Modo `codex exec`**: se filtra como `claude -p` / `omp -p` (no es una sesion a restaurar). A medir si dispara
   `SessionStart` y cual es la cadena de comando que ve el detector.
7. **Marcas OSC 133 propias**: a medir. Si Codex las dibuja, el detector las confunde con el fin del comando (TASK-851).
8. **Icono**: monocromo inline, no `img` con `currentColor`.

## Riesgos

- El formato del hash de confianza es interno de Codex y puede cambiar entre versiones: se cubre con un test que lo
  compara contra entradas reales generadas por Codex (`/hooks`) y con un fallback visible en Settings si Codex rechaza el
  hook ("Trust it from /hooks").
- Editar `config.toml` es mas delicado que escribir un fichero propio: escritura atomica, sin reserializar.
- Varias herramientas (Orca, Kaji) comparten `hooks.json`; un fallo de Kex no debe romper los suyos.

## Lo que decide quien lo construya

Nombres internos, forma exacta de la nueva variante de `ResumeSpec`, orden de las tareas dentro de cada fase.

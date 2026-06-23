# TODO

Features e ideas a implementar en el futuro. Cada item enlaza a su plan o spec detallada cuando existe.

Bugs, features y mejoras ya auditadas y priorizadas viven aparte, en [PENDING.md](PENDING.md).

> Auditoria 2026-06-23 contra el codigo: se elimino "redimensionar la ventana no persiste el tamano" (ya implementado en `window_state.rs` + `restore_window_geometry`). Varias ideas resultaron PARCIALES (el modelo ya existe, falta UI): ver notas de estado en cada seccion y el detalle en [pending/AUDIT-2026-06-23.md](pending/AUDIT-2026-06-23.md).

---

## Popup de agente: fecha original de la sesion Claude

Estado: pendiente (anotado 2026-06-16).

El campo "Started" del HoverCard del tab de agente muestra el tiempo desde que el frontend detecto la senial `started`. En sesiones restauradas con `--resume` esto es el momento del restore, no el inicio original de la sesion.

La fecha real esta en el JSONL de la sesion (primera entrada con campo `timestamp`). Para recuperarla: leer ese timestamp en Rust al procesar `SessionStart`, incluirlo en el evento `kex:agent-session-meta` como campo `sessionCreatedAt: u64`, recibirlo en el bridge TS y guardarlo en `AgentSessionMeta.sessionCreatedAt`. El HoverCard mostraria la fecha original en lugar de `startedAt` del store cuando este campo este disponible.

Ficheros implicados: `src-tauri/src/modules/agent/session_store.rs` (lectura del JSONL), `src-tauri/src/modules/pty/session.rs` (incluir en el payload), `src/modules/agents/lib/types.ts` (extender `AgentSessionMeta`), `src/modules/workspaces/PaneTabBar.tsx` (mostrar en el popover).

---

## Popup de informacion para todos los tipos de tab

Estado: PARCIAL (auditado 2026-06-23, anotado 2026-06-16). El HoverCard generico YA cubre todos los `kind` en `PaneTabBar.tsx` (`hoverBody`): terminal/agente y editor/markdown estan ricos; git-diff y git-commit-file usan `GitFileHoverContent`. Lo que FALTA es completar la metadata de `git-history` (hoy solo repo root: anadir rama activa) y `browser` (hoy solo URL: anadir estado de conexion al dev server). Texto original conservado abajo como referencia de que mostrar por kind:

- **terminal**: cwd actual, pty id (util para debug).
- **editor**: ruta completa del fichero, estado dirty, ultima modificacion.
- **preview**: URL, estado de conexion al servidor de desarrollo.
- **git-history**: rama activa, repo root.
- **git-diff**: fichero en diff, workspace.

Requiere crear un componente generico de HoverCard o especializarlo por `panel.kind`, y hacer el trigger condicional disponible para todos los tabs, no solo los de agente. Diseniar primero el componente base antes de implementar cada kind.

---

## Notas Markdown + Marcadores (giro de producto)

Plan completo y fuente de verdad: [NOTES_AND_BOOKMARKS_PLAN.md](NOTES_AND_BOOKMARKS_PLAN.md). Incluye especificacion, modelos de datos, 6 fases con rutas concretas, esqueletos de codigo (TS y Rust), criterios de aceptacion y comandos de verificacion por fase.

No es una mejora incremental del terminal: convierte Kex en un espacio de trabajo componible que ademas funciona como aplicacion de notas Markdown (edicion WYSIWYG) y un sistema de marcadores estilo Arc. Las notas son ficheros `.md` en disco, no una DB. Tres pilares pensados para anadirse poco a poco reusando primitivas existentes, sin crear modos exclusivos:

1. Notas Markdown con edicion WYSIWYG (estilo Notion/Bear).
2. Navegacion de notas: favoritos, recientes, busqueda por nombre y doble visor (carpetas + lista de notas) como segundo modo del explorer.
3. Marcadores estilo Arc: lista vertical de URLs a la izquierda, en carpetas, que abren en el panel `preview` existente.

### Por donde empezar

Fase 0 del plan (refactor habilitador): columna derecha data-driven (registro de vistas en lugar de los 3 tabs hardcodeados) y extraer una capa compartida de persistencia de documento desde `src/modules/editor/lib/useDocument.ts`. Las fases 1, 3, 4 y 5 dependen de ella. Es un cambio sin efecto funcional visible, buen primer PR aislado.

### Decision tecnica abierta: motor WYSIWYG

- Recomendado: Milkdown (preset Crepe), cargado solo de forma lazy para no inflar el bundle base (~7-8 MB es parte del producto).
- Alternativa ligera: extender CodeMirror con live preview estilo Obsidian, casi sin deps nuevas.
- Estrategia del plan: validar primero el modelo barato (Fase 1) antes de comprometer la dep pesada (Fase 4). Medir el peso real de Milkdown antes de adoptarlo y dejarlo documentado.

### Infra ya disponible (no reinventar)

- Modelo `Workspace -> Pane -> Panel` con union etiquetada `kind` extensible, panel `markdown` (solo lectura, `Streamdown`), editor CodeMirror con `@codemirror/lang-markdown` ya instalado, panel `preview` (iframe sandbox) reutilizable para marcadores, backend `fs_*` completo (read/write/search/grep/watch) y el patron `LazyStore` para stores persistentes (referencia: `src/modules/theme/customThemes.ts`).
- NO existe ningun sistema de favoritos, recientes ni marcadores en el codigo actual.
- `fs_search` ya hace busqueda fuzzy de nombres (smart-case, respeta `.gitignore`). Reusar para el quick-open de notas.
- `useDocument` ya implementa dirty tracking y autosave configurable. Extraer la parte reutilizable evita reescribirla para el panel `note`.
- Para la lista de notas con titulo/fecha/snippet, NO hacer N llamadas `fs_read_file`: el plan propone un comando Rust `notes_list` (una sola IPC, lectura parcial de ~512 bytes por fichero), que respeta el liston de perf de `AGENTS.md`.

### Documentacion viva a actualizar al implementar (mismo commit que el codigo)

- `docs/ARCHITECTURE.md`: modulos `notes/` y `bookmarks/`, nuevos kinds de panel, registro de vistas de la columna derecha, modelo de notas en disco.
- `docs/IPC.md`: comando `notes_list` (firma, params, retorno).
- `docs/FORK.md`: notas WYSIWYG y marcadores como divergencia anadida respecto al upstream.
- `AGENTS.md`: mapa de modulos (seccion "Module layout").
- `docs/BUILD.md`: solo si cambia el build (chunk lazy de Milkdown o dep nueva).

---

## Explorer: arrastrar DESDE el explorer HACIA el SO (Finder/Explorer)

Estado: investigado 2026-06-17, viable en macOS, pendiente de implementar.

Hoy el drag de archivos solo funciona en dos direcciones:

- Dentro del explorer (mover, C2).
- Desde el SO hacia el explorer (copiar, C3).

Falta el sentido inverso: arrastrar un archivo/carpeta DESDE el explorer y soltarlo en Finder/Explorer del SO (u otra app) para copiarlo/exportarlo.

### Hallazgos de la investigacion

- HTML5 `dragstart` con `DataTransfer` de tipo `Files` esta bloqueado en webviews de Tauri: no funciona.
- El plugin oficial para esto es `crabnebula-dev/tauri-plugin-drag` (Tauri 2 compatible). **No esta en `Cargo.toml` ni en las capabilities.**
- El plugin sortea el bloqueo iniciando el drag nativo desde Rust via IPC cuando el JS lo solicita.
- Compatibilidad: macOS funciona bien; Linux tiene reportes de problemas en algunos compositors (Mutter/KDE); Windows es experimental.

### Costo estimado de implementacion

| Paso | Estimacion |
|------|-----------|
| `Cargo.toml` dep + `lib.rs` plugin + capability entry | trivial |
| Comando Rust `start_drag(paths: Vec<String>)` | ~40 lineas |
| Hook `onMouseDown` largo en `TreeRow.tsx` -> IPC | ~30 lineas |
| Pruebas en macOS/Linux/Windows | 1-2h |

Total estimado: ~2h. Riesgo principal: comportamiento en Linux.

---

## Workspace: label de texto + barra superior con contexto

Estado: PARCIAL (auditado 2026-06-23). El modelo `Workspace` YA tiene `title: string` editable y persistido (`types.ts:48`). Lo que FALTA es la presentacion en la barra superior. El label es lo mas sencillo y ya tiene datos; las otras dos piezas (ultima notificacion del tab, PR de la rama) siguen pendientes y tienen dependencias (agentStore notifs, GitHub API) que merecen items separados.

### Motivacion

La barra de titulo superior esta practicamente vacia. Se podria aprovechar para mostrar:

1. **Nombre/label del workspace**: texto libre que el usuario puede poner a cada workspace ("backend API", "cliente web", "infra", ...), visible en la barra superior y en la pestaña de la barra lateral.
2. **Ultima notificacion del tab activo**: el ultimo mensaje de agente (Claude Code, Codex) en el tab activo, sin tener que ir al panel de notificaciones.
3. **PR de la rama actual**: rama git del panel activo y, si hay remote configurado, el PR asociado (consultar via `gh pr view --json number,title,url` o la API de GitHub). Spec + plan accionable en [F14](pending/features/F14-pr-de-la-rama-actual.md) (IPC `git_current_pr`, gh con fallback a REST via ureq; base tecnica de F13).

### Dependencias

- El label del workspace es una adicion pura al modelo `Workspace` (`name?: string`) y no bloquea nada.
- Notificacion del tab: ya existe `agentStore` con sessions y notifications. Solo falta leer la ultima notif para el panel activo.
- PR de rama: requiere una nueva IPC (`git_current_pr` o similar) o llamar a la GitHub API desde el frontend (con token del usuario).

### Prioridad

Bajo. El label del workspace es lo mas sencillo y util de lo tres; empezar por ahi si se implementa.

---

## Workspace: arrastrar un tab o fichero a otro workspace

Estado: idea anotada.

Permitir arrastrar un tab (panel) o un fichero desde el explorer y soltarlo en otro workspace distinto para moverlo/abrirlo ahi. Hoy el drag-and-drop de paneles solo funciona dentro del mismo workspace.

---

## Workspace: estados configurables (WIP, On Hold, Archived...)

Estado: idea anotada.

### Motivacion

Los workspaces no tienen estado. A medida que acumulan mas workspaces es util poder marcar y filtrar: en progreso, pausado, archivado, etc. Inspiracion: Nimbalyst/Linear tienen estados en tarjetas de kanban. Aqui no se quiere un tablero, solo el concepto de estado aplicado a los workspaces.

### Propuesta

- El usuario define sus propios estados en Settings: nombre, icono (emoji o hugeicons), color. Estado predeterminado vacio.
- Cada workspace tiene un estado opcional (`workspaceStatus?: string`).
- En la barra lateral de workspaces, cada workspace muestra un indicador de color/icono del estado.
- El estado se puede cambiar desde la barra superior (menu o badge clickable).
- Los workspaces se pueden filtrar o agrupar por estado en la barra lateral.

### Dependencias

Requiere que el modelo `Workspace` soporte campos custom adicionales y que la serializacion los persista. El feature de label de workspace (arriba) es un precursor natural, ya que ambos extienden el modelo `Workspace`.

### Prioridad

Bajo. El lock del explorer y el label de workspace son mas urgentes.

---

## Updater: dialogo demasiado agresivo, no se puede saltar

Estado: idea anotada (2026-06-14).

El dialogo de actualizacion ocupa toda la pantalla y no ofrece una opcion de "saltar hasta la siguiente version". Es demasiado invasivo. El modelo ideal es el de cmux: un banner o pill discreto en la parte inferior de la ventana que avisa de la nueva version, permite instalarla o saltarsela hasta la siguiente, y no bloquea el flujo de trabajo.

Modulo implicado: `src/modules/updater/`. Revisar si `tauri-plugin-updater` expone una forma de postponer o ignorar una version concreta, y almacenar la version ignorada en el store de settings para no volver a molestar hasta la siguiente.

---

## Blocks: toggle blocks <-> normal en una terminal viva (Cmd+U)

Estado: idea anotada (2026-06-14). Hoy el hint "Cmd+U switch" en el prompt de un block terminal es decorativo: no hace nada.

### Por que hoy no se hace

El modo blocks lo decide la shell al arrancar, leyendo la env var `KEX_BLOCKS` una sola vez en `zshrc.zsh`/`bashrc.bash`/`init.fish`/`profile.ps1` (suprime su prompt para que el host dibuje la barra de input). Una shell ya arrancada no cambia su prompt aunque cambie la variable. Por eso alternar el modo en caliente exigiria re-spawnear el PTY (`respawnSession`), que es destructivo: borra el scrollback y mata el proceso en curso.

### Camino para hacerlo limpio (no destructivo)

Dos piezas independientes:

1. **Integracion de shell dinamica**: que los scripts re-evaluen el modo en cada `precmd` (leyendo un fichero/var en vez de solo al arrancar), de modo que la supresion del prompt se pueda activar/desactivar sin reiniciar la shell. Esto resuelve el cambio de prompt y no necesita tmux.
2. **Persistencia de sesion (tmux u otro)**: si la shell corre dentro de una sesion tmux persistente y Kex es solo un cliente `attach`, detach/re-attach no mata el proceso ni pierde el scrollback. Complementa al punto 1 para que el toggle sea totalmente no destructivo.

Frontend: al alternar el flag `blocks` del Panel + del Session, hay que re-vincular el slot para intercambiar los handlers OSC (BlockDecorations vs prompt/cwd tracker; hoy se eligen una sola vez en `bindLeafToSlot`).

### Cuando se implemente

Recuperar el shortcut real (`terminal.toggleInput` o equivalente) cableado a esta accion y el hint del prompt pasara a ser funcional. El estilo visual del hint ya esta puesto.

---

## Explorer: View File History (historial git de un fichero)

Estado: idea anotada (2026-06-21).

Accion de menu contextual en el explorer para abrir el historial git de un fichero concreto, esten o no sus cambios sin commitear. Complementa al panel de Source Control, que solo lista ficheros modificados: el explorer muestra todos los ficheros del repo, asi que es el sitio natural para "ver el historial de este fichero" aunque no este tocado.

No es un quick win: hoy no existe filtro por path en ninguna capa.

### Lo que falta

1. **Rust**: `git_log` (`src-tauri/src/modules/git/commands.rs:101`) y `operations::log()` (`operations.rs:474`) no aceptan path. Anadir un parametro `path: Option<String>` y, cuando venga, pasar `-- <path>` al `git log`.
2. **Tipo de panel**: el panel `git-history` (`src/modules/workspaces/lib/types.ts:10`) es repo-wide (`{ kind, repoRoot }`). Anadir `filePath?: string` y propagarlo.
3. **UI**: el componente de `git-history` debe filtrar por ese path y mostrar un titulo tipo "History: foo.ts". `openGitHistoryInPanel()` (en `App.tsx`) debe aceptar el path opcional.
4. **Gating**: mostrar la accion solo si el fichero esta dentro de un repo (`git_resolve_repo`, cacheado por root del explorer).

Beneficio extra: el filtro por path en `git_log` habilita despues "ver un commit concreto de un fichero" y otros flujos de historial por fichero.

---

## Terminal: opciones de configuracion adicionales

Estado: pendiente (anotado 2026-06-22).

Continuacion de la tanda de ajustes de terminal (cursor style, inactive style, cursor width, scroll sensitivity) ya implementados. Tres opciones mas que comparten el mismo patron de plumbing: campo en `Preferences` + default + parse/clamp + setter + entrada en `PREF_KEY_MAP` (`src/modules/settings/store.ts`), funcion `apply*` en `src/modules/terminal/lib/rendererPool.ts`, effect en `useTerminalSession.ts`, y control en `GeneralSection.tsx`.

1. **Campana (bell)**: hoy no se hace nada con la senial de campana. xterm expone el evento `term.onBell`. Opciones: silenciosa (por defecto), visual (flash breve del terminal) y/o sonido. Requiere implementar el efecto (a diferencia de las opciones anteriores, que solo pasan un valor a xterm): suscribirse a `onBell` en `createSlot` y disparar el modo elegido.

2. **Confirmar pegado multilinea (paste protection)**: avisar antes de pegar texto que contiene saltos de linea, para evitar ejecutar comandos sin querer. Encaja con la politica de "validar en cada boundary" y reusa el patron del dialogo de "warn on close". Interceptar el paste (handler de xterm / clipboard) y mostrar confirmacion cuando el texto pegado tenga `\n`.

3. **Copy on select / paste con boton derecho**: comportamiento estilo terminal clasico (copiar automaticamente al seleccionar, pegar con click derecho). Dos toggles independientes. xterm da `onSelectionChange` para copy-on-select; el paste con boton derecho se cablea en el handler de contextmenu del host del slot.

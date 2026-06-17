# TODO

Features e ideas a implementar en el futuro. Cada item enlaza a su plan o spec detallada cuando existe.

Bugs, features y mejoras ya auditadas y priorizadas viven aparte, en [PENDING.md](PENDING.md).

---

## Popup de agente: fecha original de la sesion Claude

Estado: pendiente (anotado 2026-06-16).

El campo "Started" del HoverCard del tab de agente muestra el tiempo desde que el frontend detecto la senial `started`. En sesiones restauradas con `--resume` esto es el momento del restore, no el inicio original de la sesion.

La fecha real esta en el JSONL de la sesion (primera entrada con campo `timestamp`). Para recuperarla: leer ese timestamp en Rust al procesar `SessionStart`, incluirlo en el evento `kex:agent-session-meta` como campo `sessionCreatedAt: u64`, recibirlo en el bridge TS y guardarlo en `AgentSessionMeta.sessionCreatedAt`. El HoverCard mostraria la fecha original en lugar de `startedAt` del store cuando este campo este disponible.

Ficheros implicados: `src-tauri/src/modules/agent/session_store.rs` (lectura del JSONL), `src-tauri/src/modules/pty/session.rs` (incluir en el payload), `src/modules/agents/lib/types.ts` (extender `AgentSessionMeta`), `src/modules/workspaces/PaneTabBar.tsx` (mostrar en el popover).

---

## Popup de informacion para todos los tipos de tab

Estado: pendiente (anotado 2026-06-16).

Hoy el HoverCard con metadata solo aparece en tabs de agente (`hasAgent`). Extenderlo a todos los tipos de panel con informacion relevante segun el `kind`:

- **terminal**: cwd actual, pty id (util para debug).
- **editor**: ruta completa del fichero, estado dirty, ultima modificacion.
- **preview**: URL, estado de conexion al servidor de desarrollo.
- **git-history**: rama activa, repo root.
- **git-diff**: fichero en diff, workspace.

Requiere crear un componente generico de HoverCard o especializarlo por `panel.kind`, y hacer el trigger condicional disponible para todos los tabs, no solo los de agente. Diseniar primero el componente base antes de implementar cada kind.

---

## Tabs de editor/preview: guardar cwd y sincronizar con el explorer

Estado: idea anotada (2026-06-14).

Hoy los tabs de editor y preview no almacenan `cwd`. Cuando el usuario abre un fichero en el editor o carga una URL en el preview, no hay forma de saber en que carpeta estaba trabajando, y el explorer no se actualiza al volver a ese tab.

Comportamiento deseado:
- Al abrir un fichero en el editor, guardar la carpeta del fichero como `cwd` en el panel.
- Al activar un panel de editor/preview, si tiene `cwd`, sincronizar el explorer con ese path (igual que ya hace con los terminales via OSC 7).
- Esto permite que el explorer muestre el arbol de la carpeta del fichero activo en lugar de quedarse anclado al ultimo terminal visitado.

Implementacion (boceto): extender el tipo `Panel` para que editor y preview puedan llevar `cwd?: string`, rellenarlo al abrir el panel, y en el hook de seleccion de panel activo (`useExplorerRoot` o equivalente en `App.tsx`) incluir los paneles de editor/preview como fuente de `explorerRoot`.

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

## Explorer: lock a carpeta fija (no seguir el cwd del terminal)

Estado: pendiente de implementar.

### Motivacion

Hoy el explorer sigue automaticamente el `cwd` del terminal activo (`explorerRoot` en `app.tsx:273`). Esto es util por defecto, pero molesta cuando el usuario quiere tener el explorer anclado a una carpeta concreta (la raiz del repo, un workspace concreto, etc.) mientras navega libremente por el sistema de ficheros desde el terminal.

### Modelo propuesto

Dos modos para el explorer, elegibles por el usuario:

- **Auto** (comportamiento actual): el explorer sigue el cwd del terminal activo.
- **Locked**: el explorer se queda fijo en una carpeta que el usuario elige explicitamente y no se mueve aunque el terminal cambie de directorio.

El estado locked se almacena por workspace (no globalmente), de forma que cada workspace puede tener su propio root fijo. Se persiste en `workspace-state.json` junto al resto del estado del workspace.

### UX de activacion / desactivacion

Tres formas de activar el lock:
1. **Menu contextual en una carpeta del explorer** -- "Fijar explorador a esta carpeta" / "Fijar al raiz de git".
2. **Icono de candado en el header del explorer** -- cuando esta activo muestra el path fijado y permite soltar el lock con un click.
3. **Al crear un workspace** (opcional a valorar) -- dialogo inicial con "Carpeta del explorador: auto | elegir fija".

### Caso especial: git root con worktrees

"Fijar al raiz de git" debe resolver el raiz real del repositorio, no el cwd. Usar `git_resolve_repo` (ya existe en IPC) sobre el cwd actual. Si el cwd esta dentro de un worktree (`/repo/.git/worktrees/<nombre>`), `git_resolve_repo` devuelve el git root correcto (`/repo`), por lo que el comportamiento de worktrees esta cubierto sin logica adicional.

### Implementacion (boceto)

1. Anadir `lockedExplorerRoot: string | null` al modelo de workspace (`src/modules/workspaces/`). `null` = modo auto.
2. En `app.tsx`, modificar `explorerRoot` para que cuando el workspace activo tenga `lockedExplorerRoot != null`, retorne ese valor en lugar de `activeCwd`.
3. Menu contextual en `TreeRow.tsx` / `FileExplorer.tsx`: dos items nuevos -- "Fijar explorador aqui" (llama a `setLockedExplorerRoot(path)`) y "Fijar al raiz de git" (llama a `git_resolve_repo(path)` y luego `setLockedExplorerRoot(repoRoot)`).
4. Header del explorer (`FileExplorer.tsx`): anadir icono de candado junto al nombre de la carpeta raiz. Cuando `lockedExplorerRoot != null` el icono esta activo y muestra un tooltip con el path; click lo pone a null (vuelve a auto).
5. Persistencia: incluir `lockedExplorerRoot` en la serializacion del workspace.

### Lo que NO cambia

- El terminal sigue funcionando con total libertad (el cwd del terminal y el explorerRoot son independientes cuando locked).
- Si no hay lock, el comportamiento es identico al actual.

---

## Explorer: el color git no se ve cuando el fichero esta seleccionado

Estado: pendiente (anotado 2026-06-13, tras integrar C1 git decorations).

En `src/modules/explorer/TreeRow.tsx`, el tinte git del nombre solo se aplica cuando la fila NO esta seleccionada:

```tsx
className={cn(
  "min-w-0 flex-1 truncate",
  !isSelected && !gitignored && gitStatusCode && explorerGitTextClass(gitStatusCode),
)}
```

y el contenedor usa `text-foreground` cuando `isSelected` (sobre `bg-accent`). Resultado: al seleccionar un fichero modificado/nuevo, se pierde el color git.

Esto viene heredado del upstream (que tambien condiciona con `!isSelected`), probablemente porque el color git podria tener bajo contraste sobre el fondo `bg-accent` de la seleccion. Mejora deseada: mostrar el estado git tambien en la fila seleccionada, manteniendo contraste suficiente.

Opciones:

- Mantener el tinte git en el `<span>` del nombre incluso con `isSelected`, y comprobar contraste de cada color (`gitStatusColor.ts`) sobre `bg-accent`.
- O usar otro indicador no dependiente del color del texto cuando la fila esta seleccionada (p. ej. una letra de estado M/A/D/U/R atenuada a la derecha, o un punto de color), para no depender del contraste del nombre.

---

## Explorer: arrastrar DESDE el explorer HACIA el SO (Finder/Explorer)

Estado: pendiente (anotado 2026-06-13).

Hoy el drag de archivos solo funciona en dos direcciones:

- Dentro del explorer (mover, C2).
- Desde el SO hacia el explorer (copiar, C3).

Falta el sentido inverso: arrastrar un archivo/carpeta DESDE el explorer y soltarlo en Finder/Explorer del SO (u otra app) para copiarlo/exportarlo. No estaba en el plan de sync ni existe en el upstream.

Dificultad: Tauri intercepta el canal de drag-drop nativo cuando `dragDropEnabled` esta on (por eso el dnd interno usa `@dnd-kit` pointer-based). Iniciar un drag NATIVO saliente desde la webview (para que el SO lo reciba) requiere investigar si Tauri lo permite con la config actual, o un mecanismo alternativo (p. ej. el HTML5 `dragstart` con `DataTransfer` de tipo file, que suele estar bloqueado en webviews de Tauri). Investigar viabilidad antes de estimar.

---

## Workspace: label de texto + barra superior con contexto

Estado: idea anotada.

### Motivacion

La barra de titulo superior esta practicamente vacia. Se podria aprovechar para mostrar:

1. **Nombre/label del workspace**: texto libre que el usuario puede poner a cada workspace ("backend API", "cliente web", "infra", ...), visible en la barra superior y en la pestaña de la barra lateral.
2. **Ultima notificacion del tab activo**: el ultimo mensaje de agente (Claude Code, Codex) en el tab activo, sin tener que ir al panel de notificaciones.
3. **PR de la rama actual**: rama git del panel activo y, si hay remote configurado, el PR asociado (consultar via `gh pr view --json number,title,url` o la API de GitHub).

### Dependencias

- El label del workspace es una adicion pura al modelo `Workspace` (`name?: string`) y no bloquea nada.
- Notificacion del tab: ya existe `agentStore` con sessions y notifications. Solo falta leer la ultima notif para el panel activo.
- PR de rama: requiere una nueva IPC (`git_current_pr` o similar) o llamar a la GitHub API desde el frontend (con token del usuario).

### Prioridad

Bajo. El label del workspace es lo mas sencillo y util de lo tres; empezar por ahi si se implementa.

---

## Bug: redimensionar la ventana no persiste el tamaño

Estado: sin investigar (anotado 2026-06-14).

Al redimensionar la ventana principal, el tamaño no se guarda o no se restaura en el siguiente arranque. Puede que el sync con el upstream (rama `sync/upstream-2026-06-13`) lo haya roto. Investigar si el problema esta en la escritura (el plugin `tauri-plugin-window-state` no guarda) o en la lectura (no restaura al iniciar). Revisar la configuracion del plugin en `lib.rs` y `Cargo.toml`, y si el sync elimino o cambio algo relacionado.

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

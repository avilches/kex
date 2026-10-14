@.memory/MEMORY.md

<!-- El índice de la memoria de este proyecto, que vive en `.memory/` y está versionado.
     Cada regla es un fichero suelto y aquí sólo entra el índice: el fichero completo se
     lee cuando el índice apunta a algo que viene a cuento. Antes esto vivía en
     ~/.claude/projects/<ruta-con-guiones>/memory/, fuera de git y visible sólo para
     Claude Code.
     ATENCIÓN: opencode NO expande los imports (Claude Code y omp sí), así que esta ruta
     tiene que estar además en la clave "instructions" del opencode.json de la raíz.
     Lo comprueba `bash ~/Hub/dotfiles/scripts/link-agent-instructions.sh --check`. -->


## Contexto del proyecto

**Kex** es un fork del proyecto open-source **Terax** (`crynta/terax-ai`): un emulador de terminal con backend
Tauri 2 + Rust (`portable-pty`) y cliente React 19 + TypeScript + xterm.js (webgl).
Cuando un agente o herramienta mencione "Terax" en el contexto de variables de entorno, rutas de configuracion
o senales OSC, se refiere al **upstream**. En este fork todo usa el prefijo `KEX_` y las carpetas `~/.config/kex/` y
`~/.cache/kex/`, para no chocar con instalaciones del upstream.
Ver `docs/FORK.md` para la lista completa de diferencias respecto al upstream y el log de sincronizaciones.

- Bundle id: `app.betauer.kex`
- Gestor de paquetes: **pnpm**
- Plataformas: macOS, Linux, Windows
- Checks de frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`
- Checks de Rust: `cd src-tauri && cargo clippy && cargo test --locked`

## Quality bar

Production-grade or it does not ship. Every change is judged against all of these, not just "it works":

- **Correctness**: edge cases, failure modes, concurrent access. No "works for now".
- **Performance**: ultra-lightweight is the product. ~7-8 MB bundle, high-performance terminal. For every change ask:
  how much RAM it costs, whether it adds IPC round-trips or redundant requests, whether it triggers extra re-renders or
  wasted work, whether it pulls a heavy dependency. Unused features consume zero resources.
- **Security**: no critical security holes. Validate at every boundary (IPC, fs, network).
- **UI/UX**: polished, professional, premium. Every state and detail considered.
- **Architecture**: new or changed logic lives in pure, dependency-light functions (functional core); tauri commands and
  React components stay thin (imperative shell). Keeps it testable without a later rewrite.

Verify before claiming done: `pnpm lint`, `pnpm check-types`, `pnpm test`, `cargo clippy`, `cargo test --locked`. A
change to a core subsystem (terminal/shell spawn, workspace auth, git, fs, IPC) needs a test that locks the invariant.

## Conventions

- **Comments**: default to none, the code should explain itself. If genuinely needed, 1-2 lines on *why*, never *what*.
  No AI-generic filler.
- **No em-dash** anywhere: code, comments, commits, docs.
- **No emojis** anywhere.
- **Imports**: always `@/...` on the frontend, never relative across modules.
- **pnpm only**, never npm/npx/yarn.

## Glosario de nomenclatura

Cada concepto tiene UN solo nombre canonico. Si el usuario se refiere a algo con otra palabra, mapealo aqui antes de actuar. Si el usuario usa un alias que no figura en la columna "Como te refieres a ello", preguntale si quiere añadirlo al glosario y, si acepta, actualiza la fila correspondiente en este fichero.

| Termino canonico | Que es                                                                                                                      | Donde vive | Como te refieres a ello                                                                               |
|---|-----------------------------------------------------------------------------------------------------------------------------|---|-------------------------------------------------------------------------------------------------------|
| **WorkspaceBar** | Barra vertical fija izquierda (52-440px), lista de workspaces                                                               | `src/app/components/WorkspaceBar.tsx`; ancho en `workspaceBarState.ts` | "barra izquierda", "la barra o sidebar de workspaces"                                                 |
| **Sidebar** | Barra colapsable con las pestañas de Explorer / Source Control / Git History / Notes (esta ultima solo si el workspace tiene `workspaceRoot`). Puede anclarse a izquierda o derecha (`sidebarSide`)       | `src/app/components/Sidebar.tsx`; estado en `modules/workspaces/lib/sidebarState.ts` | "sidebar del explorer", "panel izquierda", "panel lateral", "el explorer"                             |
| **SidebarView** | Que vista muestra el Sidebar: `explorer \| git \| history \| notes`                                                                  | `sidebarState.ts` | "vista del sidebar", "vista del explorer/git/history", "file system"                                  |
| **Workspace** | Entorno de trabajo completo (un icono del WorkspaceBar), contiene un arbol de panes. ID `ws-`                               | `modules/workspaces/lib/types.ts`, `useWorkspaces.ts` |                                                                                                       |
| **Pane** | Celda del split dentro de un workspace (arbol binario `paneTree`); contiene una tira de tabs. ID `pane-`                    | `splitNode.ts`, `PaneView.tsx` | "panel", "split", "tab set", "listado de tabs"                                                        |
| **Tab** | Pestana dentro de un pane (terminal/editor/browser/markdown/git-diff...). ID `tab-`                                         | `types.ts` (union `Tab` por `kind`), `TabContent.tsx`, `PaneTabBar.tsx` | "pestana"                                                                                             |
| **Live Preview** | Unico motor de markdown. Editor construido directamente sobre CodeMirror 6 con decoraciones Obsidian-style (los marcadores de sintaxis se ocultan en todas las lineas salvo en la activa, donde se muestran en crudo para editarlos; las tablas GFM se ven como tabla HTML mientras el cursor no este dentro); nunca parsea a AST. Tiene tres modos en el path bar (Source, Rich y Preview; Source y Rich comparten la misma vista de CodeMirror, Preview monta `MarkdownPreviewPane` de solo lectura) y un panel Outline, sin toolbar | `src/modules/markdown/codemirror/` (shell `MarkdownTab.tsx`, editor `CodeMirrorEditor.tsx`); piezas puras compartidas en `src/modules/markdown/lib/` | "live preview", "el editor de markdown", "el editor de notas", "el editor de codemirror", "el WYSIWYG" |
| **Scratchpad** | Barra de entrada inline acoplada a la parte inferior de un Tab de terminal, para escribir/enviar texto sin usar el terminal directamente. Estado binario unico `scratchpadOpen`: existe si y solo si tiene foco real (no hay estado "abierto pero sin foco"); cualquier perdida de foco (clic en terminal, cambio de tab/workspace, Escape, Cmd+U) lo cierra. Visibilidad derivada: `scratchpadOpen && tab enfocada`. Ver `docs/SCRATCHPAD.md` (referencia canonica: modelo, todos los caminos de foco/cierre, invariante `requestLeafFocus`) | `src/modules/terminal/ScratchpadBar.tsx`; estado y acciones (`toggleScratchpad`, `closeScratchpad`, `leaveLeafScratchpad`) en `modules/terminal/lib/useTerminalSession.ts`; montado desde `TerminalPane.tsx` | "scratchpad", "SP", "input del tab", "textarea", "entrada del tab", "barra del scratchpad", "caja de texto del terminal", "el componente del scratchpad" |
| **Script** | Comando guardado y ejecutable de un workspace. Campos: `id`, `name`, `command`, `cwdMode?` (`workspace` por defecto, `context` o `fixed`), `cwd?` (solo en `fixed`), `tabId?`. Se configuran en `WorkspaceSettingsDialog` (pestana "Scripts"). Se persisten en `{app_data_dir}/workspaces/<id>.json` como campos `scripts: Script[]` y `activeScript: string` del objeto Workspace. | `src/modules/workspaces/lib/types.ts` (tipo `Script`); dialog en `src/app/components/WorkspaceSettingsDialog.tsx` | "comando", "script", "run config", "configuracion de run", "script del workspace" |
| **RunButton** | Split-button en el Header para ejecutar el script activo. Parte izquierda: ejecuta/detiene el script seleccionado. Parte derecha (chevron): dropdown para seleccionar entre los scripts configurados en el workspace y acceder a "Configure Scripts". | `src/app/components/RunButton.tsx` | "selector de scripts", "combo de scripts", "menu de run", "el run", "dropdown de scripts", "boton run con flecha", "selector combo de scripts" |
| **OpenInEditorButton** | Split-button en el Header para abrir el archivo o directorio activo en un editor externo. Parte izquierda: abre con el editor preferido. Parte derecha (chevron): dropdown para elegir editor entre los detectados automaticamente y los personalizados. Se configura en Settings > External Editors (`ExternalEditorsSection`). Preferencias persistidas en `settings-general.json` (`customEditors`, `detectedEditors`, `preferredFileEditorId`, `preferredWorkspaceEditorId`, `textEditorMode`). | `src/modules/external-editors/OpenInEditorButton.tsx`; config en `src/settings/sections/ExternalEditorsSection.tsx`; store en `src/modules/settings/store.ts` | "selector de tools", "combo de tools", "Open in", "abrir en", "el editor externo", "dropdown de tools", "selector combo de tools", "menu de herramientas externas" |
| **Workspace status** | Categoria/etiqueta de usuario para un workspace; agrupa y colapsa en el WorkspaceBar                                        | `settings/store.ts` (`WorkspaceStatus`), `statusId` | "estado", "grupo", "grupo de workspace"                                                               |
| **Header** | Barra superior: identidad del workspace activo + titulo del tab, busqueda inline, run button, campana, controles de ventana | `modules/header/Header.tsx`, `WorkspaceTitle.tsx`, `SearchInline.tsx`, `WindowControls.tsx` | "barra de arriba", "barra superior", "topbar", "cabecera"                                             |
| **Shortcuts / hotkeys** | Atajos de teclado, todos reasignables desde Settings. Registry unico `SHORTCUTS` (fuente de verdad) + overrides del usuario | `modules/shortcuts/shortcuts.ts`, `useGlobalShortcuts`, `matchesShortcut`; overrides en `usePreferencesStore((s) => s.shortcuts)` | "atajos", "teclas", "hotkeys", "keybindings"                                                          |
| **Settings** | Ventana de ajustes (webview aparte, label `settings`) + su persistencia JSON. Secciones en `src/settings/sections/`         | UI: `src/settings/SettingsApp.tsx`; store: `modules/settings/store.ts` + `preferences.ts` (`tauri-plugin-store`); JSON `settings-general.json` | "user settings", "config general", "ajustes", "preferencias", "configuracion", "el panel de settings" |
| **Settings section** | Seccion de la ventana de Settings o del dialogo de workspace                                                                | `SettingsApp.tsx` (`SettingsSection`), IPC `open_settings_window(section)` | "seccion de ajustes", "la pestaña de settings" , "grupo"                                               |
| **Notifications** | Centro de notificaciones de agentes: campana en el header, toasts Sonner, ruteo (suprimir / OS-notify / toast in-app)       | `modules/agents/components/NotificationBell.tsx`, `AgentToast.tsx`; `store/agentStore.ts` (notifications); `lib/route.ts` | "notificaciones", "la campana", "avisos", "toasts"                                                    |
| **Agent** | Agente de codificacion en un terminal (Claude Code). Deteccion Rust-side, sesiones, estado, hooks                           | `modules/agents/` (`store/agentStore.ts` sesiones), Rust `pty/agent_detect.rs`, hooks de Claude Code | "agente", "Claude Code", "el agente del terminal", "sesion de agente"                                 |
| **Agent attention** | El agente necesita tu intervencion                                                                                          | agents: `AgentStatus = working\|attention\|idle`, `attentionSince` | "necesita input", "esta esperando", "el aviso del agente"                                             |
| **WorkspaceBar resizer** | Div con `onPointerDown` que permite arrastrar para cambiar el ancho del WorkspaceBar (52-440px). Implementacion custom, NO usa `react-resizable-panels`. | `src/app/components/WorkspaceBar.tsx` cerca del final del `<nav>` | "resizer", "separador de sidebar workspace", "linea separadora de la barra izquierda", "lineas divisorias", "el resize del workspacebar" |
| **Sidebar resizer** | `<ResizableHandle />` de `react-resizable-panels` entre el Sidebar y el area central. Hay dos instancias: una cuando el Sidebar esta a la izquierda y otra cuando esta a la derecha. | `src/app/App.tsx` | "resizer", "separador del explorer", "separador de sidebar explorer", "linea divisoria del panel lateral" |
| **Pane divider** | `<ResizableHandle />` de `react-resizable-panels` dentro del arbol de splits de panes. Se instancia recursivamente en `SplitNodeView`. | `src/modules/workspaces/SplitNodeView.tsx` | "resizer", "divisor de panes", "separador de panes", "linea entre paneles", "lineas divisorias de los panes" |
| **NotesView** | Vista de notas del Sidebar (pestana "Notes" tras Git, solo con workspaceRoot definido): Quick Access + arbol de carpetas + lista de notas ordenable | `src/modules/notes/NotesView.tsx`; estado en `modules/notes/lib/` | "vista de notas", "las notas", "panel de notas", "pestana notes" |
| **Quick Access** | Lista de notas fijadas (pinned) del workspace, reordenable por drag, primera seccion de NotesView | `kex.json` campo `notes.quickAccess`; UI en `modules/notes/CollectionsColumn.tsx` | "accesos directos", "notas fijadas", "pinned", "favoritos" |
| **Workspace hibernado** | Workspace con `hibernated: true`: sus terminales y editores estan cerrados (sin PTY), los tabs siguen en el `paneTree` persistido y se muestra un overlay "Zzzzz" con boton Restore. Se hiberna con Cmd+Alt+Z (`workspace.hibernate`); un modal revisa agentes trabajando, documentos sin guardar y comandos que no volverian | `modules/workspaces/lib/hibernate.ts`, `hibernateReview.ts`, `useHibernateFlow.ts`; `src/app/components/HibernateDialog.tsx`; `docs/WORKSPACES.md` | "dormido", "suspendido", "zzz", "hibernar" |
| **kex.json** | Fichero JSON en la raiz del workspace con estado de features por-workspace, namespaced (hoy solo `notes`) | raiz del `workspaceRoot`; parse en `modules/notes/lib/notesConfig.ts` | "el kex.json", "config del workspace en el repo" |

**Falsos amigos** (cosas del codigo que se confunden):

- `leaf` (en el slot pool del terminal) no es una entidad: es el slot keyed por tab id.
- El primitivo shadcn `Tabs` (`components/ui/tabs.tsx`) y `TAB_KEY` son genericos, no la entidad **Tab**.
- `ScriptState = "running" | "waiting"` (estado de ejecucion de un script) no tiene que ver con **Agent attention**.
- El token de tema `bg-sidebar` / `--sidebar*` lo consume el **Sidebar** (derecho), no el WorkspaceBar.

## Reglas de trabajo


### Antes de investigar un bug: comprobar los GOTCHAS docs

Antes de empezar la Fase 1 (root cause investigation) de `systematic-debugging` en cualquier bug o
comportamiento inesperado, `grep -il` por palabras clave del sintoma en `docs/*_GOTCHAS.md` (hoy:
`docs/WORKSPACES_GOTCHAS.md`). Si hay una entrada relacionada, leerla entera antes de investigar
nada mas: puede ahorrar horas de re-descubrir una causa raiz ya documentada, o evitar repetir un
intento que ya fallo alli. No basta con saber que el fichero existe: hay que grepearlo activamente
como primer paso, no confiar en recordarlo.

Si la investigacion de un bug requiere mas de un intento o mas de una ronda de exploracion antes de
dar con la causa raiz, anadir una entrada nueva al GOTCHAS del subsistema correspondiente (crear uno
si no existe, siguiendo el formato de `WORKSPACES_GOTCHAS.md`: Sintoma, pistas falsas descartadas,
causa raiz, fix, leccion) antes de dar la tarea por terminada.

### Cambios de theme: verificar siempre en la pagina de preview

Cualquier peticion sobre themes (cambiar un color, ajustar contraste, anadir un theme nuevo, tocar
`inactivePaneDim`, los colores de git o del terminal) se hace y se comprueba en la pagina
`theme-preview.html`, no arrancando la app ni con capturas de pantalla:

1. Arrancar `pnpm dev` (en un worktree, con `--port <libre>` si el 1420 esta ocupado) y abrir
   `http://localhost:<puerto>/theme-preview.html?theme=<id>&mode=light|dark&view=swatches|app`.
   `view=swatches` lista cada superficie y cada token con su hex; `view=app` monta una
   aproximacion de la aplicacion (WorkspaceBar, Sidebar, Header, terminal y editor) dos veces,
   con el foco en cada panel. Ambas vistas son estaticas: todos los estados (con foco y sin foco)
   estan a la vez en pantalla, sin hacer clic en nada.
2. Editar `src/modules/theme/themes/*.ts`; Vite recarga la pagina solo. Leer el resultado con
   `window.kexThemePreview.dump()` (hex de todos los tokens y de los colores de git) o con los
   atributos `data-hex`, nunca con una captura: Dark Reader falsea los colores en Chrome.
3. Comprobar siempre los DOS modos (light y dark) y, si el cambio afecta al terminal o al editor,
   tambien el estado con foco y sin foco (`inactivePaneDim`).
4. Un theme nuevo debe verse bien en la pagina antes de darlo por terminado.

**Mantener la pagina al dia:** si se anade o cambia un componente o un estilo que use colores de
tema (una superficie nueva, un token nuevo en `ThemeColors`/`applyTheme.ts`, un estado nuevo como
otro chip de agente), hay que reflejarlo en `src/theme-preview/main.ts` en el mismo commit: la
lista `TOKENS`, la superficie correspondiente y la vista `app`. Las superficies de la pagina son
aproximaciones que copian las clases de los componentes reales, asi que no se actualizan solas.
Detalle de uso en `docs/BUILD.md`, seccion "Theme preview page".

### Añadir o cambiar una paleta (tema) sin romperla

Un tema vive en `src/modules/theme/themes/<id>.ts` y se registra en `themes/index.ts`. Estas son las
reglas que salieron de TASK-774, TASK-775 y TASK-777; saltarse cualquiera reproduce un fallo que ya
se pagó una vez.

**1. La paleta original se respeta; los colores atenuados son nuestros.**
- Los valores de la paleta oficial (fondo, texto, colores de acento, los 16 ANSI, el fondo de
  editor y de terminal si el original los distingue) se copian tal cual, sin retocarlos "porque
  quedan mejor". `withReadableText` (`readableColors.ts`) solo sube el contraste, al aplicar el tema
  y solo en los temas incluidos, de los tokens de texto tenue (`mutedForeground`,
  `primaryForeground`, `sidebarPrimaryForeground`), hasta 4.5:1 y conservando el tono.
- Los tokens que la paleta original no define (`muted`, `secondary`, `accent`, `border`, `input`,
  `ring`, `card`, `popover`, `sidebar*`) los derivamos nosotros mezclando su fondo y su texto, y se
  eligen mirando `theme-preview.html` (vistas `swatches` y `app`), no a ojo en el código: el texto de
  cada superficie debe leerse, el borde debe verse sobre su fondo y un chip sin seleccionar debe
  distinguirse del fondo. Se ajustan hasta que la preview lo confirme, en los DOS modos.
- Para el texto de un color con fondo variable (chips de workspace, botones) no se pone blanco ni
  negro a mano: `chipColorOnWhite` en `modules/workspaces/lib/workspaceColor.ts` (texto siempre blanco, y el color del fondo se oscurece lo justo para llegar a 4.5).

**2. Fondo del terminal y del editor: se eligen a propósito, no se heredan por accidente.**
- `colors.background` es el fondo de la interfaz. El fondo del terminal es `terminal.background` y el
  del editor es `editor.background` (ambos por variante). Si la paleta original usa el mismo color que
  la interfaz se pueden omitir; si usa otro (JetBrains: panel `#3c3f41`, editor y terminal
  `#2b2b2b`), hay que ponerlos, porque si no el editor y el terminal salen con el gris de la interfaz.
- Con el tema de editor en Auto el editor usa `editor.background` (o `background` si falta). El
  fondo del editor y el del tema de CodeMirror emparejado en `editorTheme` deben coincidir: se
  comprueba con `kexThemePreview.dump()` (`editor-background`) contra el fondo del tema CM.
- Con un tema de editor concreto, el editor toma el fondo y el texto de ese tema CM (los lee
  `editor/lib/editorThemeSurface.ts`), no los del tema de app.
- Un terminal en Auto usa la paleta del tema de app. Con una paleta elegida a mano, la paleta
  prestada rellena lo que no define (fondo, texto, cursor, selección) con los colores de SU tema, nunca
  con los del tema activo (`resolveTerminalPalette`). Un tema nuevo no necesita repetir esos valores.
- Una superficie de editor o de terminal que pinta un componente nuevo usa `--editor-background` /
  `--editor-foreground` / `--terminal-background`; nunca `bg-background` ni un `transparent
  !important`. Hoy las usan: CodeMirror del código (`editor/lib/extensions.ts`), markdown en Source y
  Rich (`markdownExtensions.ts`, ojo: el modo Rich añade una segunda regla con `Prec.high` que
  también hay que tocar), `MarkdownPreviewPane`, `EditorPathBar`, `TerminalPathBar` y el contenedor
  de `TerminalPane` (sin esto asoman franjas del color de la interfaz en los bordes del xterm).

**3. NUNCA un tema sin sus dos modos, oscuro y claro.** Ni en `colors` ni en `editorTheme`. Un tema sin
variante para un modo cae en silencio a la otra (`variants[mode] ?? dark ?? light`), y eso es un fallo,
no un atajo. Si la paleta original solo existe en un modo, hay dos salidas y solo dos: buscar en
internet la versión oficial del otro modo (Kanagawa Dragon tiene la suya en Lotus) o crearla nosotros
a partir de la paleta original, con las reglas 1 y 2. Si la versión del otro modo ya existe como tema
de la misma familia se reutiliza importándola, sin copiar valores (`light: kanagawa.variants.light`) y
se empareja `editorTheme.light`. `themes/themes.test.ts` falla si un tema incluido no cumple esto.
- **En Auto, editor y terminal siguen el modo del tema.** Cada tema incluido define en cada modo su
  propia paleta de terminal (16 colores ANSI más fondo, texto, cursor y selección) con un fondo de la
  misma luminosidad que el modo, y empareja un tema de editor del mismo modo (`EDITOR_THEME_MODE`). Si el
  original no trae uno, se crea (Kex Default tiene el suyo en claro y en oscuro). `themes/themes.test.ts`
  falla si un tema no lo cumple. Un terminal oscuro sobre un tema claro solo es válido si el usuario lo
  elige a mano; `paletteOf` (`resolveTerminalPalette`) conserva ese recurso de prestar la paleta del otro
  modo para los temas propios del usuario, que sí pueden traer un solo modo.
- **Terminal claro y programas hechos para fondo oscuro:** los programas pintan blanco o amarillo claro,
  que desaparece sobre un fondo claro. No se arregla retocando la paleta: xterm sube el contraste solo
  en modo claro (`minimumContrastRatio` 4.5, `minimumContrastRatioFor`); en oscuro se queda en 1 para
  no alterar los colores del tema. Al probar un tema claro se mira un diff o la salida de un programa
  con colores claros, no solo el prompt.

**4. Un tema de editor nuevo (CodeMirror)** se da de alta en `EDITOR_THEMES`, `EDITOR_THEME_MODE` y
`EDITOR_THEME_LABELS` (`settings/store.ts`) y en `EDITOR_THEME_EXT` (`editor/lib/themes.ts`), y el
tema de app lo empareja en `editorTheme: { dark, light }`.

**5. Al probar, comprobar antes el estado.**
- `terminalTheme` y `editorTheme` en `settings-general.json` (`user-data/support-dev/`): una paleta
  elegida a mano gana siempre sobre el tema de app, así que "el terminal no cambia" casi siempre es un
  valor distinto de `auto`. Se prueba con las dos preferencias en Auto.
- La Kex instalada (`/Applications/Kex.app`) no lleva los cambios de una rama: se prueba con
  `pnpm tauri dev` desde el worktree. Cada worktree usa su propio puerto de Vite (lo elige
  `scripts/tauri.mjs` y lo imprime al arrancar), así que no hace falta tocar `tauri.conf.json`.
- Se mira siempre el editor de código, el markdown en Source, Rich y Preview, el terminal, las
  muestras de Settings (Editor theme y Terminal theme) y las barras de ruta, en dark y en light.

**6. Tests que lo fijan:** `resolveTerminalTheme.test.ts` (paleta prestada y sus valores por defecto),
`resolveEditorSurface.test.ts` (fondo del editor en Auto y con tema concreto), `resolveEditorTheme.test.ts`
y `validateTheme.test.ts`. Un cambio en cómo se resuelve un color de terminal o de editor añade su caso
ahí antes de tocar el código.

### Sin compatibilidad hacia atras

Nunca anadir codigo de migracion, shims, fallbacks de clave antigua, ni ningun mecanismo de compatibilidad hacia atras. Si se renombra un campo JSON, se cambia una API interna, o se reestructura el store, los usuarios simplemente parten de los valores por defecto. No hay excepciones.

### Generacion de IDs

Todos los IDs de entidades de la aplicacion (workspaces, panes, tabs, temas, scripts, editores personalizados, etc.) se generan con la funcion `nid()` de `src/lib/ids.ts`, usando los exportados prefijados: `newWorkspaceId()`, `newTabId()`, `newEditorId()`, etc. Nunca usar `crypto.randomUUID()` ni `Math.random()` para IDs de entidades. Si se necesita un nuevo tipo de entidad, anadir su exportado `new<Tipo>Id()` en `ids.ts` antes de usarlo.

### Commits

- Todos los commits deben ser **atomicos**: un unico cambio logico por commit. No mezclar cambios no relacionados.
- Los **mensajes de commit van en ingles**.
- Nunca anadir "Co-authored-by" ni "Generated by Claude Code" (em-dash y emojis ya estan prohibidos en Conventions).

### Al terminar una tarea: merge directo a main, sin PR

En este proyecto el trabajo se hace en un worktree (`.claude/worktrees/<branch-name>`), pero al
terminar la tarea no se abre pull request: se mezcla la rama directamente en `main` y se borra el
worktree y la rama de la tarea. El PR es el flujo por defecto en otros proyectos, pero aqui no aplica.

### Shortcuts siempre configurables

Nunca hardcodear un atajo de teclado (comparar `e.key === "F2"`, `e.metaKey && e.key === "r"`, etc.) en ningun handler. Todos los shortcuts viven en el registry unico `src/modules/shortcuts/shortcuts.ts` (`SHORTCUTS`), que el usuario puede reasignar desde Settings. Para reaccionar a un atajo:

- Atajos globales: registrar el handler por `id` en el mapa que se pasa a `useGlobalShortcuts`. Si un atajo debe ceder a un widget enfocado (p. ej. el explorer maneja su propio rename), deshabilitarlo de forma contextual via la opcion `isDisabled`.
- Handlers locales de un widget (keydown propio): usar `matchesShortcut(e.nativeEvent, "<id>", userShortcuts)` con `userShortcuts = usePreferencesStore((s) => s.shortcuts)`, nunca comparar teclas a mano. Las teclas de navegacion intrinsecas de un widget (flechas en una lista, Enter para abrir) no son shortcuts de la app y pueden quedarse en el handler local.

Al anadir una accion con atajo: nueva entrada en `SHORTCUTS` (con `id`, `label`, `group`, `defaultBindings`), su `ShortcutId` en el union type, y conectar el handler. Asi aparece automaticamente en la seccion de Settings y queda reasignable.

### Settings del editor: donde vive cada ajuste

Al anadir un ajuste al editor hay que ubicarlo segun su alcance:

- **Ajuste por extension de archivo** (vive en `editorViewByExt`, resuelto con `resolveEditorView`): SIEMPRE va en el menu contextual del editor (el dropdown `[...]` de `EditorPathBar`), en su seccion "por extension". No va en la ventana de Settings (esa es global).
- **Ajuste global del editor** (preferencia top-level del store): va en DOS sitios: en su grupo "Global" del menu contextual `[...]` y tambien en la ventana de Settings, en la seccion `Editor` (`EditorSection`). Los ajustes globales del terminal van en `TerminalSection`, y los de apariencia/tema en `ThemesSection` (etiquetada "Appearance").
- **Ajuste solo-JSON**: algunas preferencias no tienen UI y se editan a mano en `settings-general.json` o `settings-editor.json`. Marcalas con un comentario `// JSON-only` en el tipo `Preferences` de `store.ts` y listalas en `docs/ARCHITECTURE.md`. Hoy son `editorHighlightActiveLine`, `editorAutoSaveDelay`, `workspacePaneLimit`, `paneSplitLimit`.

Asi el usuario puede tocar lo visual rapido desde el editor y la configuracion global queda accesible tanto en contexto como en la pantalla de ajustes.

### Controles de formulario en Settings

Usar siempre los componentes de shadcn, nunca elementos HTML nativos con estilos ad-hoc:

- **Radio buttons**: `RadioGroup` + `RadioGroupItem` de `@/components/ui/radio-group`. Patron:
  ```tsx
  <RadioGroup value={value} onValueChange={(v) => handler(v as MyType)}>
    <div className="flex items-center gap-2">
      <RadioGroupItem value="opt-a" id="my-opt-a" />
      <label htmlFor="my-opt-a" className="cursor-pointer text-[12px]">Label</label>
    </div>
  </RadioGroup>
  ```
- **Checkboxes**: `Checkbox` de `@/components/ui/checkbox` con `id` y `<label htmlFor={...}>` asociado.
- **Switches**: `Switch` de `@/components/ui/switch` (para toggles on/off dentro de `SettingRow`).

Referencia viva: `TerminalSection.tsx` (RadioGroup en scratchpad), `ExternalEditorsSection.tsx` (RadioGroup en Text Editors).

### Estilo de inputs en Settings

Todos los `<input>` nativos en pantallas de settings deben usar este patron exacto:

```
"h-8 w-full rounded border border-border bg-transparent px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
```

Diferencias importantes respecto a inputs generales:
- **`focus:outline-none focus:ring-1 focus:ring-ring`** (NO `focus-visible:ring-1`): evitar el borde azul del SO en navegacion con Tab.
- `bg-transparent` (no `bg-background`): hereda el fondo del panel de settings.
- Referencia viva: `ExternalEditorsSection.tsx` constante `INPUT_CLASS`.

Para botones de tab dentro de dialogs/modals (como `WorkspaceSettingsDialog`):
- Anadir `outline-none focus-visible:outline-none` para eliminar el borde de foco del sistema operativo.

### Estado mutable externo en React

Nunca usar `setInterval + setTick` para releer estado mutable externo (arrays a nivel de modulo, pools, caches). El state setter queda stale tras el primer render cycle y no causa re-renders. Usar `useSyncExternalStore(subscribe, getSnapshot)`. `getSnapshot` debe devolver la MISMA referencia si nada cambio (cache obligatorio), de lo contrario React lanza "infinite loop" error. Patron correcto: snapshot cacheado en el modulo, funcion `notify*()` que lo recalcula y notifica, llamar `notify*()` en todos los puntos donde el estado cambia.

### Diagnostico de bugs con Vite HMR

Cuando Vite HMR recarga un modulo con estado mutable a nivel de modulo, crea una segunda instancia. Los componentes ya montados siguen usando la instancia vieja. Para diagnosticar bugs de estado mutable, siempre hacer kill del proceso y `pnpm tauri dev` fresco antes de leer logs. No confiar en resultados de sesiones con cambios via HMR.


## Architecture

### Two-process model

**Rust (`src-tauri/`)** owns all OS access. The webview never touches the FS, processes, or shells directly - everything
goes through `invoke()` calls to commands registered in `src-tauri/src/lib.rs`:

- `pty::pty_*` - long-lived interactive PTY sessions (xterm ↔ portable-pty), managed by `PtyState` (
  `RwLock<HashMap<id, Session>>`). Output streams via a Tauri `Channel<PtyEvent>`.
- `fs::tree::*` (`fs_read_dir`, `list_subdirs`), `fs::file::*` (`fs_read_file`, `fs_write_file`, `fs_stat`,
  `fs_canonicalize`), `fs::mutate::*` (`fs_create_file`, `fs_create_dir`, `fs_rename`, `fs_delete`): file explorer +
  editor IO.
- `fs::search::*` (`fs_search`, `fs_list_files`), `fs::grep::*` (`fs_grep`, `fs_glob`): fuzzy file finder + content
  search (powered by `ignore` + `grep-*` crates).
- `git::commands::*`: full source-control surface (`git_status`, `git_diff`, `git_diff_content`, `git_stage`,
  `git_unstage`, `git_discard`, `git_commit`, `git_fetch`, `git_pull_ff_only`, `git_push`, `git_log`, `git_show_commit`,
  `git_commit_files`, `git_commit_file_diff`, `git_panel_snapshot`, `git_resolve_repo`, `git_remote_url`). All gated
  through the workspace authorization registry.
- `shell::shell_run_command`: one-shot subshell exec. On Windows via PowerShell (`-NoProfile -Command`), on Unix via
  `$SHELL -lc`. Shared helper `build_oneshot_command`.
- `shell::shell_session_*`: persistent shell session with state across calls. `shell::shell_bg_*` (`spawn`, `logs`,
  `kill`, `list`): long-running background processes (dev servers etc.) with bounded ring-buffer log capture.
- `workspace::*`: `workspace_authorize` / `workspace_current_dir` (the spawn/git cwd authorization registry) plus the
  WSL bridge (`wsl_list_distros`, `wsl_default_distro`, `wsl_home`).
- `open_settings_window`: separate webview window for Settings (optional `section` arg deep-links a section).
- `agent::agent_enable_claude_hooks` / `agent_claude_hooks_status`: atomically install Claude Code terminal hooks; gated
  on `KEX_TERMINAL`.

### PTY shell integration

PTY shells are bootstrapped via injected init scripts in `src-tauri/src/modules/pty/scripts/`:

- **Unix** (`zshenv.zsh`, `zprofile.zsh`, `zlogin.zsh`, `zshrc.zsh`, `bashrc.bash`, `init.fish`) - installed via `ZDOTDIR` (zsh),
  `--rcfile` (bash) or an init command (fish). Emit OSC 7 (cwd) and OSC 133 A/B/C/D (prompt boundaries + exit code) so the host can track cwd and
  detect command boundaries without re-parsing the prompt.
- **Windows** (`profile.ps1`) - passed via `pwsh -NoLogo -NoExit -ExecutionPolicy Bypass -File <path>`. Wraps the user's
  existing `prompt` function (after their `$PROFILE` runs) to emit OSC 7 + OSC 133 A/B/D. Shell priority: `pwsh.exe` (PS
  7+) → `powershell.exe` (PS 5.1) → `cmd.exe` (no integration). cwd is normalized to backslashes before being passed to
  ConPTY (`CreateProcessW` misbehaves with forward-slash cwd).

`pty/shell_init.rs` is split into `#[cfg(unix)]` / `#[cfg(windows)]` modules - keep new platform-specific code in the
right cfg arm.

ConPTY on Windows requires `SPAWN_LOCK` (Mutex) around `openpty + spawn_command` in `session.rs`. Concurrent spawns
leave one of the resulting PTYs with a stalled output pipe. Don't remove the lock without verifying first-tab stability
under fast tab spam.

Each ConPTY child is also assigned to a per-session **Job Object** with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` (
`pty/job.rs`). When the Job HANDLE drops - clean shutdown, panic, or even SIGKILL'd Kex process - the kernel kills
every descendant of the shell (e.g. `npm run dev` spawned from inside pwsh). Without this Windows orphans the entire
process subtree because `TerminateProcess` only kills the immediate child. macOS/Linux rely on
`Drop for Session → killer.kill()`; on dev-`Ctrl-C` of `cargo run` destructors don't fire and orphans are possible there
too - acceptable for now since dev only.

### Frontend (`src/`)

Multi-window React app: the user can open several main OS windows (File > New Window, Cmd+Shift+N), each running its
own React instance. Main windows have a `w-<id>` label; the Settings window has the fixed `settings` label. Per-window
state (geometry + Workspaces + active index) is persisted by Rust in `{app_data_dir}/workspaces.json` (index) plus
`{app_data_dir}/workspaces/<id>.json` (bodies), keyed by window label, and restored on startup. Path alias `@/*` →
`src/*`. The layout is a 3-column shell: a narrow (52px) `WorkspaceBar`
on the left, a resizable center content area, and a collapsible `Sidebar` (Explorer / Source Control / Git History /
Notes, the last conditional on the workspace having a `workspaceRoot`).
Content is organized as Workspaces → Panes → Tabs. Tabs are a tagged union (`kind`: `terminal` | `editor` |
`browser` | `markdown` | `git-diff` | `git-history` | `git-commit-file`) and **not** unmounted on switch - they're
hidden via `invisible pointer-events-none` so PTYs and dev servers keep streaming in the background.

`App.tsx` wires modules together - keep it a coordinator. New features go inside the appropriate `modules/<area>/`.

### Module layout (`src/modules/`)

Each module is self-contained, exports a thin barrel via `index.ts`, and owns its hooks under `lib/`.

- **terminal/** - `useTerminalSession` + `pty-bridge` keep one mounted xterm per tab (tabs are never unmounted).
  `osc-handlers.ts` parses OSC 7 (with Windows drive-letter normalization: `/C:/Users/foo` → `C:/Users/foo`) and OSC 133
  markers. The xterm color palette is driven by the central theme engine (`modules/theme`), not a local table.
- **editor/** - CodeMirror 6 stack (`EditorStack` mirrors `TerminalStack`). `extensions.ts` configures language modes;
  prebuilt themes are listed in `EDITOR_THEMES` (`settings/store.ts`).
- **explorer/** - file tree with Material/Catppuccin icons (`iconResolver.ts`), fuzzy search, keyboard nav, inline
  rename, context actions. Backslash-aware `basename`.
- **browser/** - web browser tab (address bar + navigation, `browser` panel kind); also surfaces the auto-detected
  dev-server tab (status-bar pill suggests opening when a localhost URL is detected).
- **header/** - top bar + inline search (`SearchInline` adapts to terminal vs editor via `SearchTarget`).
  `WindowControls` rendered when `USE_CUSTOM_WINDOW_CONTROLS` is true (Linux + Windows; macOS uses native traffic
  lights).
- **shortcuts/** - keymap registry (`shortcuts.ts`) + `useGlobalShortcuts`. Handlers live in `App.tsx` and are passed in
  by id (`tab.new`, …). `metaKey || ctrlKey` for cross-platform Cmd/Ctrl.
- **settings/** - settings store (`store.ts` via `tauri-plugin-store`), preferences hook, settings window opener.
- **workspaces/** - source of truth for the Workspace/Pane/Tab model. `useWorkspaces` owns state; `splitNode.ts` is
  the pure tree-operation library (split, remove, find, flatten). Rendering: `WorkspaceView` → `SplitNodeView` (
  recursive binary tree) → `PaneView` → `TabContent` (switches on `tab.kind`). State persisted to
  `{app_data_dir}/workspaces.json` plus `workspaces/<id>.json` by Rust (see above), debounced 300ms on every change.
- **source-control/** - git status / stage / commit panel and diff workflow.
- **git-history/** - commit graph rail, refs, per-commit file diffs.
- **markdown/**: Live Preview, the only markdown engine (`codemirror/`, lazy chunk `MarkdownTab`), built directly on
  CodeMirror 6: it never parses to an AST, only decorates the raw text (see `docs/FORK.md`). The `markdown` tab has
  Source, Rich (the decorations) and Preview modes plus an Outline; Source and Rich share one CodeMirror view.
  `MarkdownPreviewPane.tsx` is the read-only render (the same Live Preview extensions with no active line), used by the Preview mode and by the overlay/split
  preview of an `editor` tab over a `.md` (`docs/BUILD.md`, "Markdown editor chunks"). `lib/` holds the shared pure
  pieces: frontmatter, outline, image path resolution, view-mode cycling.
- **notes/** - notes view for the Sidebar (Quick Access + folder tree + sortable note list).
  Functional core in `lib/` (`notesConfig.ts` for the `kex.json` `notes` namespace, `noteSort.ts`);
  IO hooks `useNotesState` (config) / `useNotesDirs` (per-folder cache, backed by `notes_read_dirs`)
  / `useQuickAccessHeads` (backed by `notes_read_heads`). Mounted from `Sidebar.tsx` only when the
  workspace has a `workspaceRoot`. Opens each note as a `markdown` tab, so notes render in Live Preview.
- **workspace/** - workspace environment switching (Local + WSL distros).
- **theme/** - custom theme engine (no `next-themes`). `ThemeProvider` + `applyTheme` write CSS variables; built-in
  presets in `themes/` (registered in `themes/index.ts`),
  user themes via `customThemes.ts` + `validateTheme.ts`, optional background image via `bgImageStore.ts` +
  `SurfaceLayer`.
- **command-palette/**: fuzzy command/file/search palette.
- **external-editors/**: detection and launch of external editors (`OpenInEditorButton`).
- **html-preview/**: `HtmlPreviewPane`, preview of HTML files.
- **updater/** - auto-updater UI built on `tauri-plugin-updater`.
- **agents/** - terminal coding-agent notifications (Claude Code; Codex later). Shared store (`store/agentStore.ts`:
  terminal `sessions` + `notifications`) and a shared router (`lib/route.ts`: suppress when focused-and-visible,
  OS-notify when unfocused, in-app Sonner toast when focused-but-hidden) feed the header `NotificationBell`. Liveness
  (`started`/`exited`) is Rust-side (`pty/agent_detect.rs`) on the PTY reader's byte filter, armed on `OSC 133;C;<cmd>`
  and disarmed on `OSC 133;D`/PTY close, driven only by OSC sequences (never raw output, so a repainting TUI never
  flaps). Session status (`UserPromptSubmit`/`Notification`/`Stop`/`StopFailure`/`SessionEnd`/`PermissionRequest`/`SubagentStart`/`SubagentStop`)
  arrives out of band: Claude Code hooks (installed by `agent_enable_claude_hooks`, atomic write, never clobbers
  invalid JSON, prunes empty groups, gated on `KEX_TERMINAL`) run the script `agent/hooks/trigger-event.sh` (marker
  `kex-session-v6`), which forwards the hook's JSON payload as-is over a Unix domain socket, one per PTY
  (`pty/ipc.rs`, `kex-ipc-<pid>-<pty_id>.sock` under `XDG_RUNTIME_DIR` or an owner-only (0700) per-uid subdirectory of
  `$TMPDIR` otherwise, socket file itself forced to 0600, env `KEX_IPC`, `nc -U` with a `python3` fallback). The listener
  (`ipc.rs::run_listener`, `#![cfg(unix)]`) parses the JSON directly and emits `kex:agent-signal` (or, for
  `SessionStart`, calls `session_store::record_session` first); it never touches `agent_detect.rs` or its
  armed/status state machine, and this whole path is absent on native Windows. The older `OSC 777;kex;...` unified
  marker that a previous version of the hook script emitted through `terminalSequence` is still parsed by
  `agent_detect.rs::handle_kex_unified`, but nothing emits it anymore - that code path is dead today.

### UI conventions

- **shadcn/ui** is configured (`components.json`, style `radix-luma`, base `mist`, icon lib **hugeicons**). Primitives
  in `src/components/ui/` - don't hand-edit; re-run `pnpm dlx shadcn add` to upgrade.
- **Tailwind v4** - no `tailwind.config.*`, config is in `src/App.css` via `@theme`. Use `cn()` from `@/lib/utils`.
- **Small inline action buttons** (reset, clear, edit within a row or table): use a plain `<button>` with `title` for the
  tooltip (native, no Tooltip component), `size-[22px]`, `flex items-center justify-center rounded
  text-muted-foreground transition-colors hover:text-foreground`. Icon size 11-12px. The `ActionButton` in
  `ShortcutsSection.tsx` is the reference implementation.
- Animation: `motion` (Framer Motion successor). Resizable layout: `react-resizable-panels`.
- Cross-platform paths: anywhere a path may originate from OSC 7, the explorer, or the OS, normalize separators with
  `.split(/[\\/]/)` rather than `.split("/")`.
- Canonical path form on the frontend is **forward-slash**. `homeDir()` returns backslashes on Windows; convert at the
  boundary (App.tsx setHome). OSC 7 already arrives as forward-slash. Equal canonical strings keep `useFileTree` from
  wiping its tree and flashing the explorer when `tab.cwd` first arrives.

### Window styling

- macOS: `titleBarStyle: Overlay` + `hiddenTitle: true` in `tauri.conf.json` (native traffic lights via overlay).
- Linux: `decorations: false` + `transparent: true` from `tauri.linux.conf.json`; re-asserted post-realize for
  GNOME/Mutter CSD.
- Windows: same as Linux via `tauri.windows.conf.json`. React renders custom `WindowControls`.

### Tauri capabilities

`src-tauri/capabilities/default.json` is the allowlist for plugin APIs available to the webview. New plugins (dialog,
autostart, updater, window-state, store, opener, os, log are wired in `lib.rs`) typically need:

1. `Cargo.toml` dependency
2. `.plugin(...)` call in `lib.rs` `run()`
3. capability entry in `default.json`

### Cross-platform conventions

- HOME / cache dirs: use the `dirs` crate (`dirs::home_dir()`, `dirs::cache_dir()`), never raw `$HOME` /
  `%USERPROFILE%`.
- Shell init scripts: gate Unix-only logic behind `#[cfg(unix)]`; Windows arm in `pty::shell_init::windows`.
- Terminal input: send `\r` (CR) for Enter, not `\n` (LF) - PowerShell on Windows requires CR.

### Bundle config

- `bundle.targets: "all"` plus per-platform sections in `tauri.conf.json`:
    - **macOS**: `minimumSystemVersion: 13.0`.
    - **Linux**: deb depends `libwebkit2gtk-4.1-0`, `libgtk-3-0`; rpm `webkit2gtk4.1`, `gtk3`; AppImage bundles its
      media framework.
    - **Windows**: NSIS installer in `currentUser` mode (no admin required), WebView2 via `embedBootstrapper` (offline
      install).
- Auto-updater configured with a public minisign key; release artifacts at
  `https://github.com/avilches/kex/releases/latest/download/latest.json`.

## Las carpetas de la máquina, y el atajo a todas ellas

**`user-data/` tiene symlinks a las seis carpetas donde Kex escribe de verdad**, para no tener
que acordarse de cuál es cuál ni escribir la ruta a mano. Es el mismo patrón que llevan
Yottacast y el software de Hub, y lo recrea `user-data/create-links.sh`, que es idempotente.

| Enlace | A dónde | Qué hay dentro |
|---|---|---|
| `user-data/logs` | `~/Library/Logs/app.betauer.kex` | `Kex.log`, el log de la aplicación |
| `user-data/support` | `~/Library/Application Support/app.betauer.kex` | los `settings-*.json`, los temas, `workspaces.json` y `agent-sessions.json` del restore de sesiones |
| `user-data/config` | `~/.config/kex` | `hooks/`, con los ganchos de sesión que instala el agente |
| `user-data/cache` | `~/.cache/kex` | `shell-integration/`, lo que se inyecta en bash y zsh |
| `user-data/logs-dev` | `~/Library/Logs/app.betauer.kex.dev` | el `Kex.log` del build de desarrollo |
| `user-data/support-dev` | `~/Library/Application Support/app.betauer.kex.dev` | los mismos ficheros que `support`, pero del build de desarrollo |

`logs`, `support` y sus versiones `-dev` las nombra **Tauri** a partir del `identifier` de `src-tauri/tauri.conf.json`,
que hoy es `app.betauer.kex`: si cambia ahí, hay que cambiarlo en el script.

**`pnpm tauri dev` usa un identifier distinto, `app.betauer.kex.dev`** (y `productName: "Kex Dev"`),
para no pisar los datos del `.app` instalado mientras se programa Kex con él abierto a la vez. Lo
inyecta `src-tauri/build.rs` en el build de perfil `debug` vía la variable `TAURI_CONFIG`, que
`tauri::generate_context!()` mezcla sobre `tauri.conf.json` en tiempo de compilación; `pnpm tauri
build` (perfil `release`) no la toca y sigue usando `app.betauer.kex`. `config` y `cache`
(`~/.config/kex`, `~/.cache/kex`) no tienen equivalente `-dev` porque no dependen del identifier:
son la integración con Claude Code y con la shell, no datos de usuario, y se comparten a propósito
entre ambas versiones.

**En la máquina hay además carpetas de `terax`** (`~/.config/terax`, `~/.cache/terax` y
`~/Library/Application Support/app.crynta.terax`), y **no se enlazan porque el código de Kex no
las toca**: son del upstream del que esto es un fork, y solo aparecen en la documentación. Si
algún día se leyeran al arrancar, entrarían como `upstream-config` y `upstream-cache`.

De `user-data/` **solo se versiona el script**: los enlaces son de esta máquina y los ignora el
`.gitignore`, con una excepción para él, porque sin versionarlo un clon nuevo se queda sin la
carpeta y sin forma de rehacerla.

## Living documentation

These docs must stay in sync with the codebase at all times. Update them in the same commit as the code change, never as
a follow-up.

### `docs/ARCHITECTURE.md` · `docs/IPC.md` · `docs/BUILD.md`

Three complementary files - read the one that matches your task:

- **`docs/ARCHITECTURE.md`** - design overview, Workspace/Pane/Tab model, technical decisions with user-visible
  effects, known limitations, tech stack, frontend module map, security model. Read this first whenever you touch any
  subsystem.
- **`docs/IPC.md`** - full Tauri command surface (`pty::*`, `fs::*`, `git::*`, `shell::*`, `workspace::*`, `history::*`,
  misc) and the terminal agent notification protocol. Consult when adding, removing, or modifying Tauri commands.
- **`docs/BUILD.md`** - dev setup, quality checks, production build, bundle strategy, platform targets, auto-updater.
  Consult when touching CI, packaging, or the Vite/Cargo build config.

Update the relevant file(s) whenever:

- A module is added, removed, or significantly restructured.
- The Workspace/Pane/Tab data model changes.
- A new Tauri command is registered or an existing one is removed.
- A technical decision with user-visible effects changes (rendering strategy, persistence, path handling, etc.).
- A known limitation is resolved or a new one is discovered.

Do not restate what the code already makes obvious. The doc covers the *why* and the *non-obvious what*.

### `docs/WORKSPACES.md` · `docs/WORKSPACES_GOTCHAS.md`

Deep-dive into the workspace rendering stack and terminal slot pool:

- **`docs/WORKSPACES.md`** - Workspace/Pane/Tab data model, render tree (WorkspaceView → PaneView → TabContent),
  terminal session lifecycle, renderer slot pool (slot acquire/bind/unbind/reap, WebGL context management, dormant ring
  buffer), drag-and-drop architecture, resize handle constraints. Update whenever the rendering strategy, pool
  constants, visibility semantics, or drag-and-drop wiring changes.
- **`docs/WORKSPACES_GOTCHAS.md`** - bugs that were non-obvious to diagnose, with root cause, failed attempts, and
  confirmed fix. Add an entry whenever a bug in this subsystem takes more than one attempt to fix, so it is not
  re-discovered.

### `docs/AGENT_SESSION_RESTORE.md` · `docs/RESTORE_SESSION_TESTS.md`

Hooks, store JSON, algoritmo de restore, UI del tab y casos de error; y el plan de pruebas manuales con checklist de diagnostico. Update when the restore flow changes.

### `docs/SCRATCHPAD.md`

Single reference for the scratchpad's binary state model (`Session.scratchpadOpen`), and every focus/close path that touches a terminal leaf, including
the `requestLeafFocus` invariant. Update whenever the scratchpad's focus model, or its close/open paths change.

### `docs/FORK.md`

Documents every significant divergence from the upstream repo ([crynta/terax-ai](https://github.com/crynta/terax-ai)):
features removed, features added, architectural departures, and the planned roadmap. Update it whenever:

- A feature present in the upstream is removed from this fork.
- A feature that does not exist in the upstream is added to this fork.
- A new phase or roadmap item is completed or added.

Keep entries factual and grouped by phase or theme. The goal is a clear answer to "what is this fork and why does it
exist."

### Known gotchas

- **React 19 strict mode** double-mounts `useEffect` in dev → terminals spawn twice on first render. The first PTY is
  cleaned up almost immediately. The `SPAWN_LOCK` mutex serializes this; don't be alarmed by `pty opened id=1` followed
  by `pty closed id=1` in dev logs.
- **Windows PowerShell process lifecycle**: `killer.kill()` from `portable-pty` only kills the immediate child.
  Descendants (e.g. `npm run dev` started inside pwsh) survive unless something else takes them down. The Job Object in
  `pty/job.rs` handles this for the Kex-process-death case; an explicit `pty_close` from JS also kills only the
  immediate child + relies on the Job to take the rest. Don't disable the Job without a replacement.
- **Tab `cwd` storage**: comes from OSC 7 with forward slashes (after `parseOsc7` strips `/C:` → `C:`). Anything that
  consumes `tab.cwd` and passes it to a Rust fs command on Windows must normalize separators or accept both forms -
  `apply_common` in `pty::shell_init` handles this for PTY spawn; other call sites must do their own.

## Notas de implementacion
### Fix WebGL GPU al arrancar

Bug resuelto (2026-06-11, documentado en `docs/WORKSPACES_GPU.md`). Fix: `setTimeout(retryMissingWebgl, 350)` en `main.tsx` tras `showWindow` a t=50ms. Los rAFs de `scheduleUnhide` se encolan mientras la ventana esta oculta. No anadir mas retries en `rendererPool.ts` sin pasar por `main.tsx`.

### Cache de buffer sin guardar indexado por tabId, no por ruta

`useDocument.ts` (`unflushedBuffers`) preserva el buffer sucio de un tab al desmontarse (arrastrar a otro panel) para recuperarlo si la misma ruta se vuelve a montar. Estaba indexado por `path`, asi que el mismo fichero abierto en dos tabs a la vez (dos workspaces, o dos panes) hacia que el desmontaje de uno pisase o adoptase el cache del otro. Ahora la clave es `tabId` (estable por tab, unico incluso para el mismo fichero); `EditorPane` y `useDocument` reciben `tabId` como prop/opcion ademas de `path`. Ver AC8 de task-765.

La maquina de estados de conflicto de recarga (flag `conflict` + `keepLocalChanges`) y el temporizador de auto-save viven en `useConflictFlag`/`useAutoSaveTimer` en `src/modules/editor/lib/`, junto a `useDocument`.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.50.1 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->

<!-- Reglas del contenedor ~/Hub. Claude Code las carga solo al subir por los directorios; opencode, omp y Codex no suben, así que se importan a mano. -->
@~/Hub/CLAUDE.md

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
| **Action** | Comando guardado con plantilla (`pycharm {workspace}`, `pnpm dev`) que Kex ejecuta contra el contexto actual. Es un Script (`kind: "script"`: se escribe en un terminal y se puede parar; al parar la zona vuelve a pintarse roja y en el segundo click senala el arbol de procesos del tab, mientras el nombre sigue clickeable para enfocar) una App (`kind: "app"`: se lanza en segundo plano, sin parar) o un Agent (`kind: "agent"`: un agente de codigo; cada click abre un tab de terminal NUEVO y escribe el comando tal cual mas Enter, sin plantilla ni variables (las llaves son literales), sin estado de ejecucion ni parada, y Kex nunca cierra ese tab); el tipo se elige al crearla desde el unico combo Add de cada columna de Settings (Add Command, su primera entrada, abre un borrador de script en el modal; el resto es un combo con buscador alfabetico, con un preset por app y variable `{filepath}`/`{workspace}`/`{cwd}`: cada entrada lleva su icono, el nombre base y la variable en una segunda linea; los nombres de los presets llevan `{var}`, nunca `(var)`; JetBrains no ofrece variante de fichero porque sus editores solo abren workspace o carpeta; el combo no se cierra al elegir un preset, asi que se pueden anadir varios de una vez, y no ofrece los presets que ya estan instalados: una Action de preset se edita igual que cualquiera, y una app es un preset solo por su comando (`presetOf`): en cuanto el comando deja de ser el instalado deja de serlo (`ownedAfterEdit` vacia el `appId` y conserva el icono en `iconId`) y el preset vuelve a estar en el combo, y si el comando vuelve a ser el del preset lo recupera; el nombre no importa; cambiar Own button / Inside the combo no cuenta; borrar una de preset no pide confirmacion, una de usuario si) y no se cambia despues: para cambiar de tipo se borra y se vuelve a crear. Los agentes salen del escaneo (`editor_scan` devuelve tambien los de `DEFAULT_AGENTS`, con kind agent) y tienen dos presets cada uno, Workspace (`cwdMode` workspace) y Current directory (`cwdMode` context), con identidad (kind, command, cwdMode); la primera vez que se detectan agentes habilitados se siembra globalmente, con boton propio, la variante Current directory de cada uno (`planAgentSeed`), una sola vez, protegido por la preferencia persistida `agentActionsSeeded` (`setAgentActionsSeeded`). Ambito de workspace (guardada en el workspace, pensada para scripts) o global, ambas se configuran unicamente en Settings > Actions, con dos columnas, Global y This workspace con el nombre del workspace debajo (el scope del workspace llega por un puente de eventos: push de lista y contexto al abrir Settings, ops edit de vuelta); cada fila lleva asa, icono, nombre con su subtitulo, un lapiz grande que abre la Action en un modal (tambien con doble click en la fila; arriba un radio Global / This workspace (dos cajas como las cabeceras de columna) que la mueve de ambito; Run in folder primero en los scripts y los agentes, con Home por defecto, Workspace root, Current tab folder y Absolute path; luego nombre, comando y variables, y el radio Own button / Inside the combo con una vista previa de la barra (el combo con el cohete no se mueve y, abierto, lleva el titulo de grupo y el subtitulo); se guarda al escribir y se sale con Done) y la X de borrar a la derecha del todo, y arrastrar una fila a la otra columna la mueve de ambito sin confirmacion (al final de su tipo; una app que llega a un ambito donde ya hay otra con exactamente el mismo comando la sobreescribe en su sitio, con el nombre de la que llega)). `ownButton` (el radio Own button del modal) decide si tiene boton propio en la ActionsBar del Header o va en el menu "Actions" Unico del Header con su titulo "Workspace actions" primero y "Global actions" despues (los titulos solo se pintan cuando hay acciones de los dos alcances) y un recuento apagado en el trigger; la ultima entrada del menu es "Action Settings", con el icono de engranaje, que abre Settings > Actions; sin acciones la barra muestra un boton punteado "+" (solo el simbolo) que lleva a Settings > Actions directamente, sin menu intermedio ni borrador; con acciones el boton reaparece al pasar el raton por la barra. Un comando sin variables (una app, o un script con Run in Workspace root) y un agente con Run in folder = Workspace root salen en gris mientras no haya raiz de workspace, con el mensaje "Set a root to this workspace" (el mismo texto usan las lineas de `{workspace}` sin raiz). Los nombres de Action se muestran en dos lineas (nombre encima, debajo lo que el lugar actual da a la variable `{var}`: la ruta de la raiz para `{workspace}` ("Workspace" solo en Settings, que no tiene valores reales), solo el nombre del fichero para `{filepath}`, y la ruta con el principio recortado para `{cwd}`; el hover de la fila dice donde abre: "Open <nombre> in <ruta>" para workspace y carpeta, "Open <fichero> with <nombre>" para fichero) en el menu del header, en el submenu contextual, en la fila de Settings y en el boton propio del header; el ancho del boton propio se mide solo con el nombre principal. En Settings van primero los scripts, luego las apps y luego los agentes, sin mezclarse al arrastrar; en el Header y en el menu, primero las apps, luego los agentes y luego los scripts, sin limite de botones propios (los que no caben en el ancho se pliegan al menu); un boton de una app o un agente detectados que es el unico de esa app o ese agente se pinta solo con el icono, un separador entre los botones del workspace y los globales, y con Cmd (Ctrl fuera de macOS) pulsado y el raton sobre la barra, los botones de la barra y las filas del combo se arrastran entre los cuatro sitios donde vive una Action: barra workspace, barra global, combo workspace y combo global. En cuanto empieza un arrastre, la barra tiene seis zonas independientes (apps, agentes y scripts de workspace, y lo mismo de global), cada una enmarcada con borde punteado y su etiqueta aunque este vacia; una zona solo admite su tipo (app, agente o script), y las de otro tipo quedan atenuadas o, si estan vacias, ocultas, y cada seccion del combo muestra su titulo y un marco aunque este vacia (con "Drop here"); soltar sobre una Action de su mismo tipo la pone en su sitio, en su ambito o en el otro (antes o despues segun el lado del puntero; los tipos nunca se mezclan, y en una seccion del combo que tiene Actions de su tipo solo se admite entre ellas, con la mas cercana si sueltas en un hueco o en la cabecera; si no tiene de su tipo admite cualquier sitio y va al final de su tipo), soltar sobre un marco de otro ambito la mueve a el, y soltar sobre una zona de la barra la hace boton o sobre una del combo la quita de la barra. Una linea en el borde de la Action sobre la que vas a soltar marca el sitio exacto, y el combo se desplaza solo si hay mas Actions de las que caben. El boton "Actions" se ilumina como zona de suelta solo al arrastrar un boton (si no hay combo aparece uno gris punteado durante el arrastre), nunca al arrastrar una fila del combo. Una fila bloqueada tambien se arrastra. Clic derecho sobre un boton o una fila del combo: un unico item, Edit Action, que abre Settings > Actions en la columna de su ambito con esa Action abierta en su modal (`actionsSectionParam` en `lib/actionsTarget.ts`). Durante un arrastre se oculta el boton "+", las zonas que no admiten lo arrastrado no llevan etiqueta y el combo no muestra contador. En Settings cada columna lleva sus scripts, sus apps y sus agentes en tres listas que no se mezclan al reordenar, y el nombre del workspace de la columna Workspace expande sus plantillas {} como el Header. En Settings, bajo el nombre de una app y en su hover, `{cwd}` se dice "Current Directory" y `{filepath}` "Current File" (`SETTINGS_LABELS`); la barra sigue mostrando los valores reales. Cada Action tiene un target unico segun las variables de su commando (`actionTarget`): `{filepath}`/`{filename}` la hacen de fichero, `{cwd}`/`{dir}`/`{branch}`/`{repo}` de carpeta, y `{workspace}`/`{host}` (o ninguna variable) de workspace; un agente es siempre de workspace (se muestra siempre en el Header) y nunca aparece en los menus contextuales. El Header muestra las de fichero solo con un tab de fichero enfocado (editor, markdown, git-diff, git-commit-file), las de carpeta solo con un terminal enfocado y las de workspace siempre; un script en marcha se queda visible sea cual sea el tab, para poder pararlo. Variables: `{cwd}`, `{dir}`, `{branch}`, `{repo}`, `{workspace}`, `{filename}`, `{filepath}`, `{host}` (los `{file}`/`{path}` de los titulos de tab no se comparten con Actions). Los menus contextuales de las filas del explorer y del git, los segmentos de carpeta y de fichero del path bar, el root del explorer y los tabs (terminal como carpeta; editor/markdown/git-diff/git-commit-file como fichero, resuelto con `tabFilePath` para que el path sea siempre absoluto) llevan un submenu "Actions" (`RowActionsMenu`, modelo puro en `lib/contextActionEntries.ts`): las entradas ven la fila como el tab desde el que correr (una carpeta es un terminal en ella, un fichero un editor sobre el fichero; branch/repo del cache de git de la carpeta); el target manda, asi que una carpeta solo ofrece las Actions de carpeta y un fichero solo las de fichero (las de workspace nunca estan aqui, solo en el Header), y una Action cuya variable no puede llenarse alli sale en gris con el motivo (cada entrada corre con un `RunOverlay` del runner con valores, carpeta y spawn cwd propios de la fila). Una Action cuya plantilla usa una variable sin valor ahora mismo aparece deshabilitada. Un script rechaza valores con `$`, comillas, backtick o barra invertida (se escriben en una shell); una app no pasa por shell y no tiene esa restriccion. | `src/modules/actions/` (modelo en `lib/types.ts`, combo Add `AddActionMenu.tsx`, barra del Header `ActionsBar.tsx`, nombres en dos lineas `ActionNameLines.tsx`, submenu contextual `RowActionsMenu.tsx`, modelo contextual `lib/contextActionEntries.ts`, deteccion de apps en `src/modules/external-editors/`); Settings > Actions con dos columnas Global / This workspace (`ActionsSection.tsx`, `ActionsColumns.tsx`, fila `ActionRow.tsx`, modal `ActionEditDialog.tsx`, radio de donde se muestra `OwnButtonChoice.tsx`, reglas puras `lib/actionDrop.ts` y `lib/appOwnership.ts`; puente en `lib/actionsLink.ts`, `lib/actionsBroadcast.ts` y `lib/actionsFeed.ts`; no hay pestana de Actions en el dialogo del workspace) | "script", "tool", "open in", "run config", "comando", "accion", "app", "configuracion de run", "RunButton", "OpenInEditorButton", "selector de scripts", "combo de scripts", "combo de tools", "boton run", "abrir en", "combo de apps", "+ Add Application", "+ Add Command", "+ Action" |
| **Workspace status** | Categoria/etiqueta de usuario para un workspace; agrupa y colapsa en el WorkspaceBar                                        | `groupId` en `Workspace` (`modules/workspaces/lib/types.ts`); colapso en `collapsedGroupsState.ts` | "estado", "grupo", "grupo de workspace"                                                               |
| **Header** | Barra superior: identidad del workspace activo + titulo del tab, busqueda inline, barra de acciones (`ActionsBar`), campana, controles de ventana | `modules/header/Header.tsx`, `WorkspaceTitle.tsx`, `SearchInline.tsx`, `WindowControls.tsx` | "barra de arriba", "barra superior", "topbar", "cabecera"                                             |
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
| **Workspace hibernado** | Workspace con `hibernated: true`: sus terminales y editores estan cerrados (sin PTY), los tabs siguen en el `paneTree` persistido y se muestra `HibernatedOverlay` ("Hibernated for ...") con un boton para despertarlo. Se hiberna con Cmd+Alt+Z (`workspace.hibernate`); un modal revisa agentes trabajando, documentos sin guardar y comandos que no volverian | `modules/workspaces/HibernatedOverlay.tsx`, `lib/hibernate.ts`, `hibernateReview.ts`, `useHibernateFlow.ts`; `src/app/components/HibernateDialog.tsx`; `docs/WORKSPACES.md` | "dormido", "suspendido", "zzz", "hibernar" |
| **kex.json** | Fichero JSON en la raiz del workspace con estado de features por-workspace, namespaced (hoy solo `notes`) | raiz del `workspaceRoot`; parse en `modules/notes/lib/notesConfig.ts` | "el kex.json", "config del workspace en el repo" |

**Falsos amigos** (cosas del codigo que se confunden):

- `leaf` (en el slot pool del terminal) no es una entidad: es el slot keyed por tab id.
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

### Rendimiento: leer `performance/CLAUDE.md` antes de investigar

Si el usuario habla de Kex lento, congelado, de CPU o memoria altas, o pide revisar el rendimiento, lee
`performance/CLAUDE.md` antes de hacer nada: ahí están el procedimiento, las herramientas
(`python3 performance/kexperf.py`), el profiler que lleva la app (Settings > General > Diagnostics), cómo leer sus
resultados, lo ya medido y las hipótesis abiertas. No instrumentes ni propongas arreglos sin pasar por ahí.

### Themes: leer `docs/THEMES.md` antes de tocar uno

Cualquier peticion sobre themes (un color, el contraste, un theme nuevo, `inactivePaneDim`, colores de git o del terminal)
se hace y se comprueba en `theme-preview.html`, no arrancando la app ni con capturas, y `docs/THEMES.md` tiene el
procedimiento y las reglas de paleta. Las tres que no se negocian:

- La paleta oficial se copia tal cual; los tokens que no define la derivamos nosotros mirando la preview.
- Nunca un tema sin sus dos modos, oscuro y claro, ni en `colors` ni en `editorTheme`.
- Si cambias un componente o estilo que usa colores de tema, reflejalo en `src/theme-preview/main.ts` en el mismo commit.

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

### Settings: leer `docs/SETTINGS_UI.md` antes de anadir un ajuste o un control

- Un ajuste por extension de archivo va solo en el menu `[...]` del editor; uno global va en ese menu (grupo "Global") y
  tambien en la ventana de Settings.
- Controles siempre de shadcn (`RadioGroup`, `Checkbox`, `Switch`), nunca HTML nativo con estilos ad-hoc, y los
  `<input>` usan `INPUT_CLASS` (`src/settings/components/inputClass.ts`).

### Estado mutable externo en React

Nunca usar `setInterval + setTick` para releer estado mutable externo (arrays a nivel de modulo, pools, caches). El state setter queda stale tras el primer render cycle y no causa re-renders. Usar `useSyncExternalStore(subscribe, getSnapshot)`. `getSnapshot` debe devolver la MISMA referencia si nada cambio (cache obligatorio), de lo contrario React lanza "infinite loop" error. Patron correcto: snapshot cacheado en el modulo, funcion `notify*()` que lo recalcula y notifica, llamar `notify*()` en todos los puntos donde el estado cambia.

### Diagnostico de bugs con Vite HMR

Cuando Vite HMR recarga un modulo con estado mutable a nivel de modulo, crea una segunda instancia. Los componentes ya montados siguen usando la instancia vieja. Para diagnosticar bugs de estado mutable, siempre hacer kill del proceso y `pnpm tauri dev` fresco antes de leer logs. No confiar en resultados de sesiones con cambios via HMR.

## Architecture

Dos procesos: Rust (`src-tauri/`) es dueno de todo el acceso al sistema operativo, y la webview nunca toca el FS, los
procesos ni las shells, todo va por `invoke()` a comandos registrados en `src-tauri/src/lib.rs`. `App.tsx` es un
coordinador: las funcionalidades nuevas van dentro de `src/modules/<area>/` (modulo autocontenido, barrel `index.ts`,
hooks bajo `lib/`). Los tabs no se desmontan al cambiar de tab (se ocultan con `invisible pointer-events-none`) para
que los PTY y los dev servers sigan emitiendo. Mapa de modulos y decisiones: `docs/ARCHITECTURE.md`; comandos:
`docs/IPC.md`; PTY, ventanas y capabilities de Tauri: `docs/PLATFORM.md`.

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

### Cross-platform conventions

- HOME / cache dirs: use the `dirs` crate (`dirs::home_dir()`, `dirs::cache_dir()`), never raw `$HOME` /
  `%USERPROFILE%`.
- Shell init scripts: gate Unix-only logic behind `#[cfg(unix)]`; Windows arm in `pty::shell_init::windows`.
- Terminal input: send `\r` (CR) for Enter, not `\n` (LF) - PowerShell on Windows requires CR.

### Windows y ConPTY

No tocar `CONPTY_LIFECYCLE_LOCK` ni el Job Object de `pty/job.rs` sin leer `docs/PLATFORM.md`.

### Carpetas de la maquina

`user-data/` tiene symlinks a las carpetas donde Kex escribe de verdad (`logs`, `support`, `config`, `cache` y las `-dev`
del build de desarrollo). Tabla, identifiers y como recrearlos: `docs/USER_DATA.md`.

## Documentacion viva

Se actualiza en el mismo commit que el cambio de codigo, nunca despues.

- `docs/ARCHITECTURE.md`: diseno, modelo Workspace/Pane/Tab, decisiones con efecto visible, limitaciones, mapa de modulos y seguridad. Leerlo antes de tocar cualquier subsistema. Actualizar si cambia un modulo, el modelo de datos o una decision.
- `docs/IPC.md`: superficie de comandos de Tauri y protocolo de notificaciones de agentes. Actualizar al anadir o quitar un comando.
- `docs/BUILD.md`: setup, checks, build de produccion, bundle, plataformas y updater, y la pagina de preview de temas.
- `docs/PLATFORM.md`: integracion del PTY con las shells, ConPTY y Job Objects, ventanas, capabilities y estructura del frontend.
- `docs/THEMES.md`, `docs/SETTINGS_UI.md`, `docs/USER_DATA.md`: reglas de temas, de ajustes y mapa de las carpetas de la maquina.
- `docs/WORKSPACES.md`: render del workspace y pool de slots del terminal (constantes, visibilidad, drag-and-drop). `docs/WORKSPACES_GOTCHAS.md`: bugs dificiles de diagnosticar; anadir una entrada cuando uno cueste mas de un intento. `docs/WORKSPACES_GPU.md`: el fix de WebGL al arrancar (`retryMissingWebgl` desde `main.tsx` a 350 ms); no anadir mas retries en `rendererPool.ts` sin pasar por ahi.
- `docs/SCRATCHPAD.md`: modelo binario del scratchpad y todos los caminos de foco y cierre (`requestLeafFocus`).
- `docs/AGENT_SESSION_RESTORE.md`, `docs/RESTORE_SESSION_TESTS.md`, `docs/NOTIFICATIONS.md`: hooks, restore de sesiones y notificaciones de agentes, y su plan de pruebas manuales.
- `docs/FORK.md`: divergencias y roadmap respecto al upstream (funcionalidades quitadas, anadidas, decisiones de arquitectura). Actualizar cuando cambie cualquiera de ellas.

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

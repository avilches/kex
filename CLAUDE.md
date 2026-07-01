@AGENTS.md

## Contexto del proyecto

Esta aplicacion se llama **Kex**. Es un fork del proyecto open-source **Terax** (`crynta/terax-ai`).
Cuando un agente o herramienta mencione "Terax" en el contexto de variables de entorno, rutas de configuracion
o senales OSC, se refiere al **upstream**. En este fork todo usa el prefijo `KEX_` y la carpeta `~/.config/kex/`.
Ver `docs/FORK.md` para la lista completa de diferencias respecto al upstream y el log de sincronizaciones.

## Glosario de nomenclatura

Cada concepto tiene UN solo nombre canonico. Si el usuario se refiere a algo con otra palabra, mapealo aqui antes de actuar. Si el usuario usa un alias que no figura en la columna "Como te refieres a ello", preguntale si quiere añadirlo al glosario y, si acepta, actualiza la fila correspondiente en este fichero.

| Termino canonico | Que es                                                                                                                      | Donde vive | Como te refieres a ello                                                                               |
|---|-----------------------------------------------------------------------------------------------------------------------------|---|-------------------------------------------------------------------------------------------------------|
| **WorkspaceBar** | Barra vertical fija izquierda (52-220px), lista de workspaces                                                               | `src/app/components/WorkspaceBar.tsx`; ancho en `workspaceBarState.ts` | "barra izquierda", "la barra o sidebar de workspaces"                                                 |
| **Sidebar** | Barra colapsable con las pestañas de Explorer / Source Control. Puede anclarse a izquierda o derecha (`sidebarSide`)       | `src/app/components/Sidebar.tsx`; estado en `modules/workspaces/lib/sidebarState.ts` | "sidebar del explorer", "panel izquierda", "panel lateral", "el explorer"                             |
| **SidebarView** | Que vista muestra el Sidebar: `explorer \| git \| history`                                                                  | `sidebarState.ts` | "vista del sidebar", "vista del explorer/git/history", "file system"                                  |
| **Workspace** | Entorno de trabajo completo (un icono del WorkspaceBar), contiene un arbol de panes. ID `ws-`                               | `modules/workspaces/lib/types.ts`, `useWorkspaces.ts` |                                                                                                       |
| **Pane** | Celda del split dentro de un workspace (arbol binario `paneTree`); contiene una tira de tabs. ID `pane-`                    | `splitNode.ts`, `PaneView.tsx` | "panel", "split", "tab set", "listado de tabs"                                                        |
| **Tab** | Pestana dentro de un pane (terminal/editor/browser/markdown/git-diff...). ID `tab-`                                         | `types.ts` (union `Tab` por `kind`), `TabContent.tsx`, `PaneTabBar.tsx` | "pestana"                                                                                             |
| **Scratchpad** | Barra de entrada inline acoplada a la parte inferior de un Tab de terminal, para escribir/enviar texto sin usar el terminal directamente. 3 estados internos: `scratchpadOpen` (visible), `scratchpadActive` (sub-vista logica activa vs terminal), `scratchpadFocused` (foco real del textarea) | `src/modules/terminal/ScratchpadBar.tsx`; estado y acciones (`toggleScratchpad`, `cycleScratchpad`, `closeScratchpad`) en `modules/terminal/lib/useTerminalSession.ts`; montado desde `TerminalPane.tsx` | "scratchpad", "input del tab", "textarea", "entrada del tab", "barra del scratchpad", "caja de texto del terminal", "el componente del scratchpad" |
| **Script** | Comando guardado y ejecutable de un workspace. Campos: `id`, `name`, `command`, `cwd?`, `tabId?`. Se configuran en `WorkspaceSettingsDialog` (pestana "Scripts"). Se persisten en `{app_data_dir}/workspaces/<id>.json` como campos `scripts: Script[]` y `activeScript: string` del objeto Workspace. | `src/modules/workspaces/lib/types.ts` (tipo `Script`); dialog en `src/app/components/WorkspaceSettingsDialog.tsx` | "comando", "script", "run config", "configuracion de run", "script del workspace" |
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
| **WorkspaceBar resizer** | Div con `onPointerDown` que permite arrastrar para cambiar el ancho del WorkspaceBar (52-220px). Implementacion custom, NO usa `react-resizable-panels`. | `src/app/components/WorkspaceBar.tsx` cerca del final del `<nav>` | "resizer", "separador de sidebar workspace", "linea separadora de la barra izquierda", "lineas divisorias", "el resize del workspacebar" |
| **Sidebar resizer** | `<ResizableHandle />` de `react-resizable-panels` entre el Sidebar y el area central. Hay dos instancias: una cuando el Sidebar esta a la izquierda y otra cuando esta a la derecha. | `src/app/App.tsx` lineas ~2727 y ~2772 | "resizer", "separador del explorer", "separador de sidebar explorer", "linea divisoria del panel lateral" |
| **Pane divider** | `<ResizableHandle />` de `react-resizable-panels` dentro del arbol de splits de panes. Se instancia recursivamente en `SplitNodeView`. | `src/modules/workspaces/SplitNodeView.tsx` ~linea 115 | "resizer", "divisor de panes", "separador de panes", "linea entre paneles", "lineas divisorias de los panes" |

**Falsos amigos** (cosas del codigo que se confunden):

- `leaf` (en el slot pool del terminal) no es una entidad: es el slot keyed por tab id.
- El primitivo shadcn `Tabs` (`components/ui/tabs.tsx`) y `TAB_KEY` son genericos, no la entidad **Tab**.
- `ScriptState = "running" | "waiting"` (estado de ejecucion de un script) no tiene que ver con **Agent attention**.
- El token de tema `bg-sidebar` / `--sidebar*` lo consume el **Sidebar** (derecho), no el WorkspaceBar.

## Reglas de trabajo

### Sin compatibilidad hacia atras

Nunca anadir codigo de migracion, shims, fallbacks de clave antigua, ni ningun mecanismo de compatibilidad hacia atras. Si se renombra un campo JSON, se cambia una API interna, o se reestructura el store, los usuarios simplemente parten de los valores por defecto. No hay excepciones.

### Generacion de IDs

Todos los IDs de entidades de la aplicacion (workspaces, panes, tabs, temas, scripts, editores personalizados, etc.) se generan con la funcion `nid()` de `src/lib/ids.ts`, usando los exportados prefijados: `newWorkspaceId()`, `newTabId()`, `newEditorId()`, etc. Nunca usar `crypto.randomUUID()` ni `Math.random()` para IDs de entidades. Si se necesita un nuevo tipo de entidad, anadir su exportado `new<Tipo>Id()` en `ids.ts` antes de usarlo.

### Commits

- Todos los commits deben ser **atomicos**: un unico cambio logico por commit. No mezclar cambios no relacionados.
- Los **mensajes de commit van en ingles**.
- Sin em-dash, sin emojis, y nunca anadir "Co-authored-by" ni "Generated by Claude Code".
- Los ficheros de handoff (`HANDOFF-*.md`) **nunca se commitean**: son notas de sesion, no parte del repo.

### Gestion de tareas pendientes

- Cuando el usuario pide recordar una feature para mas adelante: añadirla a `docs/TODO.md`.
- Cuando algo queda pendiente y el usuario decide no hacerlo ahora: añadirlo a `docs/PENDING.md` con referencia al fichero de detalle en `docs/pending/` (subdirectorios: `bugs/`, `features/`, `improvements/`).
- Cuando el usuario pregunta "que queda por hacer": mostrar primero `docs/PENDING.md`, luego `docs/TODO.md`.
- Al revisar lo pendiente, buscar tambien ficheros de handoff sueltos (p. ej. `HANDOFF-*.md` en la raiz o en `docs/`) por si el usuario quiere continuar con alguno. Listarlos, decir de que trata cada uno, y ofrecer al usuario limpiarlos, unificarlos o mover su contenido vivo a `docs/PENDING.md` o `docs/TODO.md`. No borrar ni mover un handoff sin confirmacion del usuario.

### Shortcuts siempre configurables

Nunca hardcodear un atajo de teclado (comparar `e.key === "F2"`, `e.metaKey && e.key === "r"`, etc.) en ningun handler. Todos los shortcuts viven en el registry unico `src/modules/shortcuts/shortcuts.ts` (`SHORTCUTS`), que el usuario puede reasignar desde Settings. Para reaccionar a un atajo:

- Atajos globales: registrar el handler por `id` en el mapa que se pasa a `useGlobalShortcuts`. Si un atajo debe ceder a un widget enfocado (p. ej. el explorer maneja su propio rename), deshabilitarlo de forma contextual via la opcion `isDisabled`.
- Handlers locales de un widget (keydown propio): usar `matchesShortcut(e.nativeEvent, "<id>", userShortcuts)` con `userShortcuts = usePreferencesStore((s) => s.shortcuts)`, nunca comparar teclas a mano. Las teclas de navegacion intrinsecas de un widget (flechas en una lista, Enter para abrir) no son shortcuts de la app y pueden quedarse en el handler local.

Al anadir una accion con atajo: nueva entrada en `SHORTCUTS` (con `id`, `label`, `group`, `defaultBindings`), su `ShortcutId` en el union type, y conectar el handler. Asi aparece automaticamente en la seccion de Settings y queda reasignable.

### Settings del editor: donde vive cada ajuste

Al anadir un ajuste al editor hay que ubicarlo segun su alcance:

- **Ajuste por extension de archivo** (vive en `editorViewByExt`, resuelto con `resolveEditorView`): SIEMPRE va en el menu contextual del editor (el dropdown `[...]` de `EditorPathBar`), en su seccion "por extension". No va en la ventana de Settings (esa es global).
- **Ajuste global del editor** (preferencia top-level del store): va en DOS sitios: en su grupo "Global" del menu contextual `[...]` y tambien en la ventana de Settings, en la seccion `Editor` (`EditorSection`). Los ajustes globales del terminal van en `TerminalSection`, y los de apariencia/tema en `ThemesSection` (etiquetada "Appearance").
- **Ajuste solo-JSON**: algunas preferencias no tienen UI y se editan a mano en `settings-general.json`. Marcalas con un comentario `// JSON-only` en el tipo `Preferences` de `store.ts` y listalas en `docs/ARCHITECTURE.md`. Hoy son `editorHighlightActiveLine`, `editorAutoSaveDelay`, `workspacePaneLimit`, `paneSplitLimit`, `keepFolderLayoutOnChangeExplorerRoot`.

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

## Documentacion viva

- `docs/ARCHITECTURE.md` + `docs/IPC.md` + `docs/BUILD.md` — referencia principal (ver AGENTS.md para politica de actualizacion)
- `docs/WORKSPACES.md` + `docs/WORKSPACES_GOTCHAS.md` — subsistema de workspaces y pool de terminales
- `docs/AGENT_SESSION_RESTORE.md` — hooks, store JSON, algoritmo de restore, UI del tab, casos de error
- `docs/RESTORE_SESSION_TESTS.md` — plan de pruebas manuales con checklist de diagnostico
- `docs/FORK.md` — divergencias y roadmap respecto al upstream

## Notas de implementacion
### Fix WebGL GPU al arrancar

Bug resuelto (2026-06-11, documentado en `docs/WORKSPACES_GPU.md`). Fix: `setTimeout(retryMissingWebgl, 350)` en `main.tsx` tras `showWindow` a t=50ms. Los rAFs de `scheduleUnhide` se encolan mientras la ventana esta oculta. No anadir mas retries en `rendererPool.ts` sin pasar por `main.tsx`.

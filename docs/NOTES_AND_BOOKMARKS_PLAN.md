# Plan ejecutable: Kex como espacio componible (Notas Markdown + Marcadores)

Documento de especificacion e implementacion pensado para ser ejecutado por un agente.
Cada fase es autocontenida, enviable de forma aislada, y deja todas las comprobaciones de calidad en verde.

## Como usar este documento

1. Lee primero la seccion "Orientacion en el codigo" para situarte.
2. Ejecuta las fases en orden. No saltes la Fase 0: es el refactor habilitador del que dependen las demas.
3. Antes de dar una fase por terminada, ejecuta el bloque "Verificacion" de esa fase.
4. Donde el documento muestra rutas o firmas de funciones, verificalas contra el codigo real antes de editar. El codigo es la fuente de verdad; este plan puede haber quedado desfasado.
5. Respeta sin excepcion las convenciones de `AGENTS.md` (sin em-dash, sin emojis, imports con `@/...`, pnpm, functional core / imperative shell, tests para invariantes de subsistemas core).

## Principios de diseno (no negociables)

1. Reusar primitivas existentes (paneles, explorer, comandos `fs_*`, panel `preview`, `LazyStore`) en vez de duplicarlas.
2. Cada fase aporta valor por si sola y se puede enviar sin las siguientes.
3. Coste cero cuando una capacidad no se usa: lazy-load de componentes pesados, stores que no se hidratan hasta que se abre su vista.
4. Las notas son ficheros `.md` en disco, nunca una base de datos opaca. Compatibles con el explorer, con git y con editores externos.
5. Anadir una capacidad nueva debe ser "registrar una vista o un kind de panel", no reescribir el shell.

---

## Orientacion en el codigo

Rutas confirmadas durante el analisis (verificar antes de editar):

### Frontend

- Modelo de paneles (union etiquetada `Panel`): `src/modules/workspaces/lib/types.ts`
- Estado de workspaces: `src/modules/workspaces/lib/useWorkspaces.ts`
- Operaciones puras del arbol de panes: `src/modules/workspaces/lib/splitNode.ts`
- Persistencia del estado de workspaces: `src/modules/workspaces/lib/workspaceState.ts`
- Render de panel segun `kind`: `src/modules/workspaces/PanelContent.tsx` (switch sobre `panel.kind`, lazy-load de todo menos terminal)
- Tab bar de un pane (muestra punto dirty): `src/modules/workspaces/PaneTabBar.tsx`
- Coordinador principal: `src/app/App.tsx`
  - Apertura de fichero en panel: `openFileInPanel(path, pin?)` (aprox. linea 321)
  - Apertura de markdown: `openMarkdownInPanel(path)` (aprox. linea 388)
  - Callbacks de panel: `updatePanelData`, `closePanel`, `activatePanel`
- Columna derecha (3 tabs hardcodeados explorer/git/history): `src/app/components/RightPanel.tsx`
- Sidebar de workspaces (52px): `src/app/components/WorkspaceSidebar.tsx`
- Tipo de id de vista lateral: `src/modules/sidebar/` (`SidebarViewId`)
- Explorer raiz: `src/modules/explorer/FileExplorer.tsx`
- Estado del arbol de ficheros: `src/modules/explorer/lib/useFileTree.ts`
- Filas del arbol y menu contextual: `src/modules/explorer/TreeRow.tsx`
- Busqueda fuzzy del explorer: `src/modules/explorer/ExplorerSearch.tsx` (invoca `fs_search`)
- Resolver de iconos: `src/modules/explorer/lib/iconResolver.ts`
- Editor (CodeMirror 6): `src/modules/editor/EditorPane.tsx`
- Ciclo de vida del documento (read/write/dirty/autosave): `src/modules/editor/lib/useDocument.ts`
- Sync editor con disco: `src/modules/editor/useEditorFileSync.ts`
- Resolver de lenguaje (incluye markdown): `src/modules/editor/lib/languageResolver.ts`
- Preview markdown actual (solo lectura, `Streamdown`): `src/modules/markdown/MarkdownPreviewPane.tsx`
- Preview de URL (iframe sandbox): `src/modules/preview/PreviewPane.tsx`
- Store de settings (`LazyStore` "terax-settings.json"): `src/modules/settings/store.ts`
- Hook de preferencias (Zustand): `src/modules/settings/preferences.ts`
- Patron de store persistente de referencia: `src/modules/theme/customThemes.ts`
- Abrir ventana settings: `src/modules/settings/openSettingsWindow.ts`

### Backend (Rust)

- Registro de comandos: `src-tauri/src/lib.rs` (`invoke_handler`, ventanas, plugins)
- FS arbol: `src-tauri/src/modules/fs/tree.rs` (`fs_read_dir`, `list_subdirs`)
- FS fichero: `src-tauri/src/modules/fs/file.rs` (`fs_read_file`, `fs_write_file`, `fs_stat`, `fs_canonicalize`)
- FS mutacion: `src-tauri/src/modules/fs/mutate.rs` (`fs_create_file`, `fs_create_dir`, `fs_rename`, `fs_delete`)
- FS busqueda fuzzy de nombres: `src-tauri/src/modules/fs/search.rs` (`fs_search`, `fs_list_files`)
- FS grep contenido: `src-tauri/src/modules/fs/grep.rs` (`fs_grep`, `fs_grep_interactive`, `fs_glob`)
- FS watch: `src-tauri/src/modules/fs/watch.rs` (`fs_watch_add`, `fs_watch_remove`, evento `fs:changed`)
- Helper de canonicalizacion: `to_canon` en `src-tauri/src/modules/fs/mod.rs`

### Hechos relevantes confirmados

- El panel `markdown` actual es SOLO lectura (`Streamdown`). No hay editor WYSIWYG instalado.
- `@codemirror/lang-markdown` ya esta en `package.json`. CodeMirror ya edita markdown como codigo.
- NO existe ningun sistema de favoritos, recientes ni marcadores en ninguna parte.
- `fs_write_file` escribe de forma atomica (tempfile + rename), preserva permisos y emite `fs:file-written` con `{ path, source }`.
- `useDocument` ya implementa dirty tracking (comparacion saved vs buffer) y autosave configurable por preferencias (`editorAutoSave`, `editorAutoSaveDelay`).
- `fs_search` es fuzzy, smart-case, respeta `.gitignore`, poda `node_modules/.git/target/...`, devuelve `{ hits: [{path, rel, name, is_dir}], truncated }`.
- dnd-kit ya se usa para reordenar workspaces y arrastrar ficheros.
- Patron de store: `LazyStore` + evento cross-window `terax://...-changed` + hook Zustand con `init()` idempotente (ver `customThemes.ts`).

---

## Comandos de verificacion (ejecutar al cierre de cada fase)

```bash
pnpm lint
pnpm check-types
pnpm test
cd src-tauri && cargo clippy && cargo test --locked
```

Una fase no esta terminada hasta que los cinco pasan. Cualquier cambio a un subsistema core (fs, paneles, persistencia) necesita un test que fije el invariante.

---

## Modelos de datos (referencia para todas las fases)

```ts
// src/modules/workspaces/lib/types.ts  -> ampliar la union Panel
| { id: string; kind: "note"; path: string; title?: string; dirty: boolean }

// src/modules/notes/lib/notesStore.ts  (LazyStore "terax-notes.json")
export type NoteVault = { id: string; name: string; root: string };
export type RecentNote = { path: string; openedAt: number };
export type NotesState = {
  favorites: string[];        // rutas canonicas (forward-slash)
  recents: RecentNote[];      // ring buffer, cap 30, mas reciente primero
  vaults: NoteVault[];
};

// Resultado del comando Rust notes_list
export type NoteListItem = {
  path: string;     // canonica, forward-slash
  title: string;    // frontmatter title | primer "# H1" | nombre de fichero sin extension
  mtime: number;    // ms desde epoch
  snippet: string;  // primera linea de cuerpo no vacia, recortada
};

// src/modules/bookmarks/lib/bookmarksStore.ts  (LazyStore "terax-bookmarks.json")
export type Bookmark = {
  id: string; url: string; title: string;
  favicon?: string; folderId?: string; order: number;
};
export type BookmarkFolder = { id: string; name: string; order: number };
export type BookmarksState = { bookmarks: Bookmark[]; folders: BookmarkFolder[] };
```

Convencion de rutas en el frontend: forma canonica forward-slash. Normalizar separadores con `.split(/[\\/]/)` cuando una ruta venga de OSC 7, del explorer o del SO. En Windows, `panel.cwd` y rutas equivalentes pueden llegar con backslash; normalizar antes de pasarlas a comandos `fs_*`.

---

# Fase 0: Refactor habilitador

Objetivo: dejar el shell preparado para enchufar vistas y paneles nuevos sin reescribirlo. Sin cambios funcionales visibles.

## 0.1 Columna derecha data-driven

Hoy `src/app/components/RightPanel.tsx` tiene 3 tabs hardcodeados (explorer, git, history) y lee `rightPanelActiveTab` de preferencias.

Cambios:

1. Crear `src/modules/sidebar/rightPanelViews.ts` con un registro de vistas:

```ts
import type { ComponentType, ReactNode } from "react";

export type RightPanelViewId = "explorer" | "git" | "history" | "notes" | "bookmarks";

export type RightPanelView = {
  id: RightPanelViewId;
  title: string;
  Icon: ComponentType<{ className?: string }>;  // hugeicons
  render: () => ReactNode;
};
```

2. Refactorizar `RightPanel.tsx` para mapear sobre un array `views: RightPanelView[]` (recibido por props o construido en `App.tsx`) en lugar de los 3 divs fijos. El tab strip y el contenido se generan desde el registro. Mantener el comportamiento actual: un solo contenido visible (`absolute inset-0`), el resto montado pero oculto si conviene preservar estado, o desmontado si no.

3. Ampliar el tipo `SidebarViewId` en `src/modules/sidebar/` para incluir `"notes"` y `"bookmarks"`.

4. Ampliar `rightPanelActiveTab` en `src/modules/settings/preferences.ts` y su validacion/loader en `src/modules/settings/store.ts` para aceptar los nuevos ids, con fallback a `"explorer"` si el valor persistido es desconocido.

Restriccion: en esta fase NO se anaden las vistas Notas ni Marcadores todavia. Solo se registran explorer/git/history a traves del nuevo mecanismo, comprobando que el comportamiento es identico al actual.

## 0.2 Capa compartida de persistencia de documento

Hoy la logica read/write/dirty/autosave vive en `src/modules/editor/lib/useDocument.ts`, acoplada al editor CodeMirror. El futuro panel `note` (WYSIWYG) necesita lo mismo.

Cambios:

1. Extraer a `src/modules/editor/lib/documentPersistence.ts` (functional core) las piezas reutilizables, sin dependencia de CodeMirror:
   - lectura via `fs_read_file` con manejo de `Text | Binary | TooLarge`
   - escritura via `fs_write_file` (con `source` para no auto-recargar el propio panel)
   - calculo de estado dirty (comparacion saved vs buffer)
   - logica de autosave (timeout configurable)
2. `useDocument.ts` pasa a consumir esa capa, conservando su API publica actual (no romper `EditorPane`).
3. Exponer un hook fino `useDocumentBuffer({ path })` reutilizable por el panel `note` que devuelva `{ status, content, save, markDirty, dirty }`.

Criterio de no-regresion: el editor de codigo sigue funcionando igual (cargar, editar, dirty, autosave, guardar con Ctrl+S, recarga al cambiar en disco).

## Verificacion Fase 0

- La columna derecha se ve y se comporta exactamente igual que antes (explorer/git/history).
- El editor de codigo no ha cambiado de comportamiento.
- Nuevo test: el registro de vistas resuelve el id activo y cae a `"explorer"` ante un id desconocido.
- Nuevo test: `documentPersistence` calcula dirty y serializa escritura correctamente (sin tocar disco real: inyectar las funciones `fs_*` o usar un doble).
- Pasan los cinco comandos de verificacion.

---

# Fase 1: Edicion markdown real (toggle Preview/Fuente)

Objetivo: poder editar un `.md`, no solo previsualizarlo. Primera aproximacion a WYSIWYG con coste de bundle casi nulo.

## 1.1 Toggle en el panel markdown

1. En `src/modules/workspaces/lib/types.ts`, ampliar el panel `markdown` con un modo de vista:

```ts
| { id: string; kind: "markdown"; path: string; title?: string; view?: "preview" | "source" }
```

(`view` opcional, por defecto `"preview"` para no romper estado persistido).

2. En el componente que renderiza el panel markdown (`PanelContent.tsx` caso `"markdown"`), anadir una cabecera con un toggle Preview/Editar:
   - `preview`: render actual con `Streamdown` (`MarkdownPreviewPane`).
   - `source`: montar `EditorPane` con `lang-markdown` (ya soportado por `languageResolver`).
3. El toggle muta el panel via `updatePanelData(wsId, panelId, p => ({ ...p, view }))`.
4. Reusar la capa de persistencia de la Fase 0 para el modo `source`: guardado con Ctrl+S, dirty en el tab, autosave segun preferencias.

## 1.2 Live preview ligero (opcional dentro de esta fase)

Como puente hacia WYSIWYG sin dependencia pesada, anadir una extension de CodeMirror de "live preview" estilo Obsidian: decoraciones que, fuera de la linea del cursor, ocultan los marcadores (`**`, `#`, `-`, etc.) y renderizan inline negrita/cursiva/encabezados/enlaces/checklists. Vive en `src/modules/editor/lib/markdownLivePreview.ts` y se activa solo cuando el documento es markdown.

Si el alcance crece, esta subseccion 1.2 puede diferirse: la Fase 4 entrega el WYSIWYG real.

## Verificacion Fase 1

- Abrir un `.md` permite alternar Preview/Editar; las ediciones se guardan a disco (round-trip correcto).
- El punto de dirty aparece en el tab al editar y desaparece al guardar.
- Cambiar el fichero desde fuera recarga el panel (via `fs:file-written`).
- Test del round-trip de guardado y del toggle de `view`.
- Pasan los cinco comandos de verificacion.

---

# Fase 2: Modelo de notas y stores persistentes

Objetivo: favoritos, recientes y vaults persistidos, mas un comando Rust eficiente para listar notas con metadatos.

## 2.1 notesStore (frontend, sin Rust)

1. Crear `src/modules/notes/lib/notesStore.ts` siguiendo el patron de `src/modules/theme/customThemes.ts`:
   - `LazyStore("terax-notes.json", { defaults: {}, autoSave: 200 })`
   - Claves: `favorites`, `recents`, `vaults`.
   - Funciones: `listFavorites`, `toggleFavorite(path)`, `isFavorite(path)`, `pushRecent(path, openedAt)` (ring buffer cap 30, dedup por path, mas reciente primero), `listRecents`, `listVaults`, `addVault`, `removeVault`.
   - Evento cross-window `terax://notes-changed` emitido tras cada mutacion.
   - `onNotesChange(cb)` combinando `store.onChange` y `listen` del evento.
   - Normalizar rutas a canonica forward-slash antes de guardar (usar `fs_canonicalize` cuando convenga, o normalizacion en frontend).
2. Crear hook Zustand `src/modules/notes/lib/useNotesStore.ts` con `init()` idempotente (igual patron que `usePreferencesStore`).
3. Preferencia nueva `notesRootPath` (en `preferences.ts` + `store.ts`), por defecto vacio; si vacio, usar `~/Notes` resuelto en el frontend cuando exista, o pedir al usuario que designe carpeta (estado vacio gestionado en Fase 3).

Importante: `openedAt` no se puede generar con `Date.now()` en codigo de workflow, pero en runtime normal del frontend si. Para tests, inyectar el timestamp.

## 2.2 Comando Rust notes_list

Para la lista de notas (titulo + fecha + snippet de muchos ficheros) NO hacer N llamadas `fs_read_file`. Anadir un comando que recorra el vault una sola vez.

1. Crear `src-tauri/src/modules/fs/notes.rs` (o anadir a un modulo existente segun la organizacion real):

```rust
#[derive(serde::Serialize)]
pub struct NoteListItem {
    pub path: String,    // canonica, forward-slash
    pub title: String,
    pub mtime: u64,      // ms epoch
    pub snippet: String,
}

#[tauri::command]
pub async fn notes_list(
    root: String,
    workspace: Option<WorkspaceEnv>,
) -> Result<Vec<NoteListItem>, String> {
    // Recorrer con el crate `ignore` (ya en uso), filtrar extensiones .md/.markdown/.mdx.
    // Por cada fichero leer solo los primeros ~512 bytes:
    //   - si empieza con frontmatter YAML (---\n ... \n---), extraer `title:` si existe.
    //   - si no, primer encabezado `# ...` como titulo.
    //   - si no, nombre de fichero sin extension.
    //   - snippet: primera linea de cuerpo no vacia que no sea encabezado, recortada a N chars.
    // Devolver ordenado por mtime descendente.
}
```

   - Reusar el helper `to_canon` para las rutas.
   - Gatear por la autorizacion de workspace igual que el resto de comandos fs (ver como lo hacen `fs_read_dir`/`fs_search`).
   - Podar directorios pesados igual que `search.rs` (`node_modules`, `.git`, etc.).
   - Limite de seguridad de numero de ficheros escaneados (como `MAX_SCANNED` en `search.rs`).

2. Registrar `notes_list` en el `invoke_handler` de `src-tauri/src/lib.rs`.
3. Wrapper frontend `src/modules/notes/lib/notesList.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
export async function notesList(root: string, workspace?: WorkspaceEnv): Promise<NoteListItem[]> {
  return invoke("notes_list", { root, workspace: workspace ?? null });
}
```

## 2.3 Registrar recientes al abrir notas

En `App.tsx`, en el punto donde se abre un `.md` (tanto en `openFileInPanel` cuando la extension es markdown, como en `openMarkdownInPanel`), llamar a `pushRecent(path, Date.now())`. Mantener `App.tsx` como coordinador: la logica vive en `notesStore`.

## Verificacion Fase 2

- `notes_list` devuelve titulo correcto en los tres casos (frontmatter, H1, nombre fichero) y snippet seguro (sin panico con ficheros vacios/binarios/solo-frontmatter).
- Test Rust de `notes_list` con un vault temporal: orden por mtime, extraccion de titulo, snippet, poda de dirs.
- Favoritos y recientes persisten entre recargas; el ring buffer respeta cap 30 y dedup.
- Test del ring buffer de recientes (timestamp inyectado).
- Pasan los cinco comandos de verificacion.

---

# Fase 3: Vista Notas en el explorer (doble visor)

Objetivo: el conmutador "dos maneras de ver" del explorer, con favoritos, recientes y busqueda por nombre.

## 3.1 Conmutador de modo en el explorer

1. En `src/modules/explorer/FileExplorer.tsx` anadir un toggle en la cabecera: modo `tree` (actual) o modo `notes`. Persistir la eleccion en preferencias (`explorerViewMode: "tree" | "notes"`).
2. Modo `tree`: sin cambios.
3. Modo `notes`: renderizar el nuevo componente `src/modules/notes/NotesView.tsx`.

Alternativa de integracion (decidir segun encaje real): en vez de un toggle dentro del explorer, registrar "Notas" como vista propia de la columna derecha usando el registro de la Fase 0. Preferible si se quiere ver Notas y el arbol de codigo a la vez en distintos momentos sin perder estado. Elegir la que menos complejidad anada; ambas reusan `NotesView`.

## 3.2 NotesView: visor de colecciones + visor de notas

Layout en dos regiones (estilo Bear / Apple Notes):

- Visor de colecciones (arriba o columna izquierda):
  - Seccion `Favoritos` (de `notesStore.favorites`).
  - Seccion `Recientes` (de `notesStore.recents`).
  - Arbol de carpetas del vault (reusar `useFileTree` filtrando a directorios, o `list_subdirs`).
- Visor de notas (debajo o columna derecha):
  - Lista de notas de la coleccion/carpeta seleccionada, via `notes_list(root)`.
  - Cada item muestra titulo, fecha relativa y snippet.
  - Orden por mtime descendente.
  - Estrella para favorito on/off (llama `toggleFavorite`).
  - Click abre la nota en panel `note` (Fase 4) o, mientras la Fase 4 no exista, en panel `markdown` con `view: "source"` (Fase 1).

Componentes sugeridos:
- `src/modules/notes/NotesView.tsx` (orquestador de las dos regiones)
- `src/modules/notes/CollectionsPane.tsx`
- `src/modules/notes/NoteList.tsx`
- `src/modules/notes/NoteListItem.tsx`

## 3.3 Quick-open de notas

1. Atajo nuevo `notes.quickOpen` (`Cmd/Ctrl+O`) registrado en `src/modules/shortcuts/shortcuts.ts`, handler en `App.tsx`.
2. Paleta que reusa `fs_search` con `root = notesRootPath`, mostrando resultados por nombre y abriendo al `Enter`. Reusar la UX de `ExplorerSearch.tsx` como referencia (debounce 300ms, navegacion con flechas).

## 3.4 Acciones de nota

- "+ Nueva nota": crea `Untitled.md` (o nombre incremental) en la carpeta activa via `fs_create_file`, la abre con foco, registra reciente.
- Favorito on/off desde lista y menu contextual.
- Renombrar / borrar reusando las mutaciones del explorer (`fs_rename`, `fs_delete`). Al renombrar o borrar, actualizar `notesStore` (favoritos y recientes que apunten a la ruta antigua) reusando los callbacks `onPathRenamed` / `onPathDeleted` que el explorer ya emite.

## Verificacion Fase 3

- El explorer alterna entre arbol y vista de notas; la eleccion persiste.
- Favoritos y recientes se ven y se actualizan en vivo (cross-window via evento).
- Quick-open encuentra notas por nombre y las abre.
- Renombrar/borrar una nota favorita actualiza el store (sin rutas colgadas).
- Tests: sincronizacion de `notesStore` ante rename/delete; render de la lista con datos de `notes_list`.
- Pasan los cinco comandos de verificacion.

---

# Fase 4: WYSIWYG completo (panel `note`)

Objetivo: edicion WYSIWYG markdown estilo Notion, lazy-loaded, con toggle a fuente.

## 4.1 Decision de motor

Recomendado: Milkdown con el preset Crepe (ProseMirror, markdown-native, slash commands, tablas, checklists, imagenes listas de fabrica). Round-trip a `.md` limpio, requisito por el modelo de notas en disco.

Restriccion de bundle: la dependencia se carga SOLO de forma lazy (dynamic import dentro del componente del panel), de modo que el coste es cero hasta abrir una nota. Verificar el peso real anadido y dejarlo documentado.

Alternativa ligera si el coste no compensa: quedarse en el modelo CodeMirror live-preview de la Fase 1.2 y no introducir Milkdown. En ese caso, el panel `note` envuelve el editor CodeMirror con live-preview activado por defecto.

## 4.2 Panel note

1. Ampliar la union `Panel` en `types.ts` con `{ id; kind: "note"; path: string; title?: string; dirty: boolean }`.
2. Crear `src/modules/notes/NotePane.tsx`:
   - Carga/guarda via `useDocumentBuffer({ path })` (capa de la Fase 0).
   - Editor WYSIWYG (Milkdown Crepe) cargado con `import()` dinamico, con fallback de "Cargando editor...".
   - Serializa a markdown en cada cambio relevante, marca dirty, autosave segun preferencias, Ctrl+S guarda.
   - Toggle WYSIWYG <-> Fuente: el modo fuente reusa `EditorPane` con `lang-markdown` sobre el mismo `path`. El toggle no debe perder cambios sin guardar (guardar o sincronizar buffer antes de cambiar de modo).
3. Anadir el caso `"note"` en `PanelContent.tsx` con lazy-load (`React.lazy`).
4. Hacer que abrir un `.md` desde el explorer/notes abra por defecto un panel `note` (preferencia `markdownDefaultPanel: "note" | "markdown" | "editor"`, por defecto `"note"`). Mantener "Open Preview" del menu contextual para forzar el panel `markdown`.

## 4.3 Estabilidad del round-trip

El riesgo principal de un WYSIWYG markdown es que el round-trip (markdown -> AST -> markdown) altere el fichero (reordenar atributos, cambiar comillas, normalizar listas). Mitigaciones:
- No reescribir el fichero si el contenido serializado es identico al cargado (comparar antes de `fs_write_file`).
- Test de round-trip sobre un corpus de notas representativas (encabezados, listas anidadas, checklists, tablas, bloques de codigo, frontmatter, enlaces, imagenes) verificando estabilidad idempotente (serializar dos veces da el mismo resultado).
- Preservar el frontmatter YAML tal cual (no dejar que el editor lo destruya).

## Verificacion Fase 4

- Abrir una nota muestra el editor WYSIWYG; editar y guardar produce markdown limpio en disco.
- Toggle WYSIWYG/Fuente conserva cambios.
- El bundle base no crece cuando no se abre ninguna nota (verificar que el chunk de Milkdown es separado y lazy).
- Test de round-trip idempotente del corpus de notas.
- Pasan los cinco comandos de verificacion.

---

# Fase 5: Marcadores estilo Arc

Objetivo: lista vertical de URLs a la izquierda, en carpetas, reordenables, que abren en el panel `preview`.

## 5.1 bookmarksStore (frontend, sin Rust)

1. Crear `src/modules/bookmarks/lib/bookmarksStore.ts` con el mismo patron (`LazyStore("terax-bookmarks.json")`):
   - Claves `bookmarks` y `folders`.
   - Funciones: `listBookmarks`, `addBookmark({ url, title, folderId? })` (favicon resuelto al anadir), `removeBookmark(id)`, `updateBookmark(id, patch)`, `reorderBookmark(id, toOrder, folderId?)`, CRUD de folders.
   - Evento `terax://bookmarks-changed`, `onBookmarksChange(cb)`.
2. Hook Zustand `src/modules/bookmarks/lib/useBookmarksStore.ts` con `init()` idempotente.
3. Favicon: resolver en el frontend (por ejemplo via `https://www.google.com/s2/favicons?domain=...` o leyendo `/favicon.ico`), guardar la URL del favicon en el bookmark. Validar la URL en el limite antes de guardarla.

## 5.2 Vista Marcadores

1. Registrar la vista "Marcadores" en el registro de la Fase 0 (`rightPanelViews.ts`), con su icono hugeicons.
2. Componente `src/modules/bookmarks/BookmarksView.tsx`:
   - Lista vertical de marcadores con favicon + titulo, agrupada por carpetas colapsables.
   - Reordenar y mover entre carpetas con dnd-kit (reusar el patron de `WorkspaceSidebar`).
   - Boton "+" para anadir (formulario URL + titulo), edicion y borrado por menu contextual.
3. Abrir un marcador: crear o activar un panel `preview` con la URL (reusar `openPanel` con `{ kind: "preview", url }`). Si ya existe un `preview` con esa URL, activarlo en vez de duplicar.

## 5.3 Guardar desde el panel preview

En `src/modules/preview/PreviewPane.tsx` (o su barra de direcciones), anadir accion "Guardar marcador" que toma la URL actual y el titulo, y llama `addBookmark`.

## Verificacion Fase 5

- Anadir, abrir, reordenar, mover entre carpetas y borrar marcadores funciona y persiste.
- Abrir un marcador reusa/activa el panel `preview` sin duplicar.
- Guardar desde `preview` crea el marcador con favicon y titulo.
- Tests del store: orden estable, carpetas, dedup de apertura, persistencia.
- Pasan los cinco comandos de verificacion.

---

# Fase 6: Pulido, atajos y documentacion

Objetivo: rematar UX y mantener la documentacion viva en sync (obligatorio en el mismo commit que el codigo, nunca como follow-up).

## 6.1 Pulido

- Estados vacios (sin vault designado, sin favoritos, sin marcadores) con call-to-action claro.
- Iconografia consistente (hugeicons), botones de accion segun la convencion de `AGENTS.md` (`size-[22px]`, icono 11-12px, `title` nativo para tooltip).
- Atajos: alternar vista Notas, nueva nota, quick-open, alternar Marcadores. Registrar en `shortcuts.ts` con `metaKey || ctrlKey`.
- Menus contextuales coherentes entre explorer, notas y marcadores.

## 6.2 Documentacion (en el mismo commit que el codigo)

- `docs/ARCHITECTURE.md`: nuevo modulo `notes/` y `bookmarks/`, nuevos kinds de panel, registro de vistas de la columna derecha, modelo de notas en disco.
- `docs/IPC.md`: nuevo comando `notes_list` (firma, params, retorno) y, si se anaden, otros comandos fs.
- `docs/FORK.md`: divergencia respecto al upstream (notas WYSIWYG y marcadores como features anadidas; fases completadas).
- `docs/BUILD.md`: solo si cambia el build (por ejemplo, el chunk lazy de Milkdown o una dep nueva).
- `AGENTS.md`: actualizar el mapa de modulos en la seccion "Module layout".

## Verificacion Fase 6

- Todos los flujos tienen estado vacio y atajos funcionales.
- La documentacion refleja el estado real del codigo.
- Pasan los cinco comandos de verificacion.

---

# Apendice: decisiones clave y riesgos

## Decisiones

- WYSIWYG: Milkdown (Crepe) lazy-loaded como recomendacion; CodeMirror live-preview como alternativa ligera si el bundle no compensa. La Fase 1 valida el modelo barato antes de comprometer la dep pesada en la Fase 4.
- Notas como ficheros `.md` en disco (no DB), por compatibilidad con explorer/git/editores externos.
- Favoritos, recientes, vaults y marcadores en `LazyStore` (sin Rust), patron `customThemes.ts`.
- Lista de notas via comando Rust `notes_list` (una IPC, lectura parcial de ficheros) para no incurrir en N round-trips.
- Columna derecha convertida en registro de vistas: anadir capacidades = registrar vistas, no reescribir el shell.

## Riesgos y mitigaciones

- Coste de bundle de Milkdown: lazy-load estricto; validar el modelo ligero antes; alternativa CodeMirror disponible.
- Round-trip markdown que modifica el fichero: no reescribir si el contenido es identico; test de idempotencia; preservar frontmatter.
- Seguridad de marcadores (URL/iframe/favicon): la URL pasa por el sandbox existente de `preview`; validar en el limite; favicon resuelto sin exponer fs.
- Sincronizacion disco <-> stores: actualizar favoritos/recientes ante rename/delete reusando los callbacks del explorer.
- Rutas cross-platform: normalizar separadores en todo limite (OSC 7, explorer, SO); forma canonica forward-slash en el frontend; en Windows normalizar `panel.cwd` antes de pasarlo a `fs_*`.

## Orden de dependencias entre fases

- Fase 0 habilita 1, 3, 4, 5.
- Fase 1 entrega edicion utilizable de forma independiente.
- Fase 2 habilita 3.
- Fase 3 es usable abriendo notas en panel `markdown` (Fase 1) hasta que llegue la Fase 4.
- Fase 4 sustituye el destino por defecto al panel `note`.
- Fase 5 es independiente de notas (solo depende de la Fase 0).
- Fase 6 cierra.

# Explorer root recordado por fichero

Fecha: 2026-06-18

## Contexto

Hoy el root del explorer y el contexto de git derivan ambos de un unico valor, `explorerRoot`, calculado en `src/app/App.tsx` a partir del cwd del terminal activo (OSC 7) con cadena de fallbacks: terminal activo, ultimo cwd de terminal conocido, cualquier terminal, `home`.

Consecuencias del modelo actual:

- Un `cd` en el terminal activo mueve a la vez el arbol del explorer, las decoraciones git y el panel de Source Control.
- Cambiar entre terminales con cwd distinto tambien los mueve.
- Al seleccionar el tab de un fichero (editor o markdown), el explorer NO salta a donde estaba ese fichero: se queda en el ultimo cwd de terminal conocido.

Puntos del codigo relevantes:

- `src/app/App.tsx:337` calcula `explorerRoot` (memo).
- `src/app/App.tsx:396` `openFileInPanel` crea los paneles editor/markdown.
- `src/modules/source-control/useSourceControlContext.ts` resuelve el context path de git a partir del tab activo y de `explorerRoot`.
- `src/modules/explorer/lib/useGitStatus.ts` colorea el arbol solo si el snapshot git "cubre" el `explorerRoot` (`covers`). Si no lo cubre, no hay colores.
- Persistencia: `src/modules/workspaces/lib/workspaceState.ts` (frontend) mas comandos Rust `window_save_workspace_state` / `window_get_state`. El lado Rust guarda los workspaces como `serde_json::Value` sin tipar (`src-tauri/src/modules/window_state.rs:29`), en el fichero `workspaces.json` del data dir (`src-tauri/src/lib.rs:319`).

## Objetivo

Que cada panel de fichero recuerde el `explorerRoot` que se mostraba en el momento de abrirlo, y que al activar ese tab el explorer y git salten a ese root recordado. El recuerdo debe sobrevivir a reinicios de la aplicacion.

## Regla de negocio

Al abrir un fichero, el root recordado es:

- el `explorerRoot` actual, si el fichero esta dentro de el; o
- la carpeta padre del fichero (`dirname(path)`), si el fichero esta fuera del `explorerRoot` actual.

El segundo caso solo ocurre hoy al editar un tema personalizado (`useThemeFileEditing` abre un `.json` en `~/.config/kex/themes/`, fuera del proyecto). En ese caso el tab mostrara esa carpeta de temas, no el proyecto del usuario. El resto de vias de apertura (arbol, buscador difuso `fs_search` con `root: explorerRoot`, busqueda de contenido, creacion de fichero) siempre producen ficheros bajo el `explorerRoot`, por lo que recordaran el `explorerRoot`.

El recuerdo es una instantanea fijada en el momento de abrir. Reactivar un fichero ya abierto no lo recalcula.

## Decision de alcance

Unificado: al activar un tab de fichero, tanto el arbol del explorer como las decoraciones git y el panel de Source Control saltan al root recordado.

Razon: los colores del arbol se calculan a partir del snapshot git (`useGitStatus` -> `covers`). Si el arbol apuntara a un sitio distinto del que resuelve git, el snapshot no cubriria el root del arbol y los ficheros se quedarian sin color. Mantener arbol y git en el mismo root es lo que hace que el sistema funcione, no solo lo mas coherente.

## Diseno

### 1. Modelo de datos (`src/modules/workspaces/lib/types.ts`)

Anadir un campo opcional a los paneles de fichero:

```ts
| { id: string; kind: "editor";   path: string; title?: string; dirty: boolean; preview: boolean; explorerRoot?: string }
| { id: string; kind: "markdown"; path: string; title?: string; explorerRoot?: string }
```

`explorerRoot` es la carpeta que el explorer debe mostrar cuando ese tab este activo. Opcional, para no romper sesiones guardadas antiguas (paneles sin el campo).

### 2. Logica pura testeable (`src/modules/workspaces/lib/explorerRoot.ts`, nuevo)

Dos funciones puras, con su test `explorerRoot.test.ts`:

```ts
// root a recordar para un fichero abierto mientras se mostraba `explorerRoot`
resolveOpenRoot(explorerRoot: string | null, path: string): string
// = (explorerRoot && isUnder(path, explorerRoot)) ? explorerRoot : dirname(path)

// root expuesto en funcion del panel activo y el root ambiental (terminal)
resolveActiveExplorerRoot(
  activePanel: { kind: string; explorerRoot?: string } | null,
  ambient: string | null,
): string | null
// = (activePanel es editor|markdown && activePanel.explorerRoot) ? activePanel.explorerRoot : ambient
```

Normalizacion de separadores a forward-slash (forma canonica del frontend) antes de comparar. `dirname` via `pathDirname` de `@/lib/pathUtils`.

### 3. Captura al abrir (`openFileInPanel`, `src/app/App.tsx`)

- Leer el `explorerRoot` actual via un `explorerRootRef` (para no recrear el callback en cada `cd`).
- Calcular `resolveOpenRoot(explorerRootRef.current, path)` y guardarlo en el panel nuevo (editor o markdown).
- La rama de "ya abierto" (activar el existente) no toca su `explorerRoot`.
- Revisar tambien cualquier otro punto de creacion de paneles editor/markdown (p. ej. `useWorkspaces.ts` linea ~239) para fijar el campo de forma consistente.

### 4. Resolucion cuando el tab esta activo (`src/app/App.tsx`)

- Renombrar el memo actual a `ambientExplorerRoot` (logica de terminal sin cambios).
- `explorerRoot` expuesto = `resolveActiveExplorerRoot(activePanel, ambientExplorerRoot)`.
- `explorerRootRef` refleja el `explorerRoot` expuesto (lo que se esta mostrando) para que la captura del paso 3 use el valor correcto.

Como el arbol (`rootPath={explorerRoot}`), las decoraciones git y el panel SC ya derivan de este `explorerRoot`, la unificacion explorer + git sale sin cambios adicionales en esos consumidores.

### 5. Git: ajuste de consistencia (`src/modules/source-control/useSourceControlContext.ts`)

Hoy, con el panel SC activo y un tab de editor, `sourceControlContextPath` usa `dirname(activeTab.path)`. Cambiarlo para que use el `explorerRoot` (el recordado, que llega ya como parametro). En el caso comun resuelve el mismo repo; evita una inconsistencia en repos anidados (monorepo con repo dentro de `vendor/`) donde `dirname(file)` resolveria el repo anidado mientras el arbol muestra el externo.

### 6. Conservar al alternar markdown / editor (`setPanelView`, `src/modules/workspaces/lib/useWorkspaces.ts`)

El toggle vista renderizada <-> editor reconstruye el panel con `id/path/title`. Anadir que arrastre tambien `explorerRoot` en ambas direcciones.

### 7. Persistencia

Sin cambios de codigo:

- Frontend: `sanitizePanel` hace `{ ...p }`, conserva el campo.
- Rust: workspaces se guardan como `serde_json::Value` sin tipar, conserva el campo en `workspaces.json` y al releer.
- Va con el guardado debounced existente (800ms) y el flush al cerrar ventana.

Compatibilidad: paneles antiguos sin `explorerRoot` resuelven via fallback ambiental. Sin migracion.

## Comportamiento resultante

- Terminal en X, abres ficheros de X: recuerdan X. Saltar entre sus tabs deja explorer + git en X.
- Terminal en X y otro en Y; abres `a` desde X y `b` desde Y: el tab `a` muestra X, el tab `b` muestra Y.
- Editar un tema: su tab muestra `~/.config/kex/themes`, no el proyecto.
- Al reiniciar, cada tab de fichero recuerda su root.
- Seleccionar un tab de terminal: el explorer vuelve a seguir al terminal (comportamiento actual intacto).

## Casos borde

- Fichero abierto con `explorerRoot` ambiental `null` (sin terminal aun): root recordado = `dirname(path)`.
- Reactivar un fichero ya abierto: conserva el root original.
- Panel persistido sin el campo: cae al root ambiental.
- Fichero fuera del root (tema): recuerda su carpeta padre; git muestra el estado de esa carpeta (el fichero no aparece como cambio del proyecto del usuario, lo cual es correcto).

## Fuera de alcance

- Navegacion manual del root del explorer independiente del tab activo.
- Logica de "repo del fichero" mas alla de la regla dentro/fuera del root (no se camina el arbol buscando `.git`).
- Cambios en el modelo de persistencia o en el lado Rust.

## Verificacion

- Tests unitarios de `resolveOpenRoot` y `resolveActiveExplorerRoot` (dentro, fuera, sin campo, terminal activo, ambient null).
- `pnpm lint`, `pnpm check-types`, `pnpm test`.
- Verificacion manual de los escenarios de "Comportamiento resultante", arrancando `pnpm tauri dev` fresco (no via HMR, por el estado mutable de modulo).

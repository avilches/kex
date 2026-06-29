# Workspace Settings + Sidebar Resizable + F12 Run

**Fecha:** 2026-06-29
**Rama de implementacion:** workspace-settings

---

## Alcance

Este spec cubre:

1. Modelo de datos extendido del Workspace
2. Shortcuts nuevos (`workspace.rename`, `workspace.settings`)
3. Menu contextual en el sidebar de workspaces
4. Rename inline del workspace
5. Modal de Workspace Settings (nombre, color, pinnedRoot, run configs)
6. Sidebar de workspaces redimensionable con persistencia por ventana
7. Boton Run en el header (F12)
8. Sistema de estado running/stopped para run configs
9. Cambios secundarios: max del sidebar del explorer x2, colapsacion de modos del explorador

---

## 1. Modelo de datos

### Cambios en `Workspace` (`src/modules/workspaces/lib/types.ts`)

```typescript
type RunConfig = {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  panelId?: string; // ID del terminal panel donde se ejecuto; validado en carga
};

type Workspace = {
  // campos existentes sin cambio:
  id: string;
  title: string;
  cwd?: string;           // interno/automatico; NO se expone en UI
  paneTree: SplitNode;
  activePaneId: string;
  explorerRootMode?: ExplorerRootMode;
  showHidden?: boolean;
  pinnedRoot?: string;    // carpeta explicita del workspace; editable en modal
  fsRoot?: string;
  git?: WorkspaceGitConfig;
  // nuevos:
  color?: string | null;      // null/absent = sin color; hex string = color explicito
  runConfigs?: RunConfig[];
  activeRunConfigId?: string; // config seleccionado en el combo Run
};
```

**Color:** `null` o ausente significa sin acento de color (estilo muted del theme). `string` es un color hex elegido de la paleta o introducido manualmente. Los workspaces nuevos reciben un color de la paleta asignado via `PALETTE[idHue(id) % PALETTE.length]`.

**`cwd` vs `pinnedRoot`:** `cwd` sigue siendo el directorio de trabajo automatico (spawn de terminales, git). `pinnedRoot` es la carpeta que el usuario asocia explicitamente al workspace para el explorador y el modal de settings. Son independientes.

**`RunConfig.panelId`:** se persiste en `workspace-state.json`. Al cargar, se valida que el panel siga existiendo en el paneTree; si no, se limpia a `undefined`.

### Explorer root modes

`ExplorerRootMode` pasa de 3 valores (`"workspace" | "pinned" | "filesystem"`) a 2:

```typescript
export type ExplorerRootMode = "workspace" | "filesystem";
```

El modo `"workspace"` usa `pinnedRoot`. Si `pinnedRoot` no esta definido, el selector de modo muestra "Workspace" **disabled**. El modo `"pinned"` desaparece; el campo `pinnedRoot` del workspace ya lo cubre.

**Migracion al cargar workspaces existentes:**
- `explorerRootMode === "pinned"` → cambiar a `"workspace"` (semantica identica).
- `explorerRootMode === "workspace"` y `pinnedRoot` no definido → copiar `cwd` a `pinnedRoot` si `cwd` existe; de lo contrario cambiar a `"filesystem"`. Esto evita que workspaces existentes queden con el explorador disabled.
- Cualquier otro valor o ausente → no se toca.

---

## 2. Nuevos shortcuts

En `src/modules/shortcuts/shortcuts.ts`:

```typescript
| "workspace.rename"    // Cmd+Shift+R  — Rename Workspace
| "workspace.settings"  // Cmd+Shift+,  — Workspace Settings
```

Grupo: `"General"`. Sin colision con shortcuts existentes. `workspace.close` ya existe (`Cmd+Shift+W`) y se muestra tambien en el menu contextual.

---

## 3. Menu contextual del sidebar de workspaces

`SortableWorkspaceItem` se envuelve con `ContextMenu`. Items:

| Icono | Label | Shortcut mostrado |
|---|---|---|
| `PencilEdit01Icon` | Rename Workspace | Cmd+Shift+R |
| `Settings01Icon` | Workspace Settings | Cmd+Shift+, |
| _(separador)_ | | |
| `Cancel01Icon` | Close Workspace | Cmd+Shift+W |

La X de hover (boton de cierre flotante) se mantiene ademas del menu contextual.

---

## 4. Rename inline del workspace

Nuevo store `src/modules/workspaces/lib/workspaceRenameStore.ts`:

```typescript
type WorkspaceRenameStore = {
  renamingId: string | null;
  startRename: (id: string) => void;
  clearRename: () => void;
};
```

Cuando `renamingId` coincide con el ID del item, el boton del sidebar muestra un `Popover` con un `<input>` prefijado con el `title` actual (patron identico a `PaneTabBar` con `tabRenameStore`). On `Enter` o blur: llama a `setWorkspaceTitle(id, newTitle)` (nueva accion en `useWorkspaces` que hace `setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, title } : w))`).

El shortcut `workspace.rename` activa el rename del workspace activo. El menu contextual activa el rename del workspace sobre el que se hace clic derecho.

---

## 5. Modal de Workspace Settings

### Estado

Nuevo store `src/modules/workspaces/lib/workspaceSettingsStore.ts`:

```typescript
type WorkspaceSettingsStore = {
  open: boolean;
  workspaceId: string | null;
  openSettings: (id: string) => void;
  closeSettings: () => void;
};
```

### Componente

`src/app/components/WorkspaceSettingsDialog.tsx` - Dialog de shadcn. Se monta en `App.tsx` (como el resto de dialogs globales).

### Secciones del modal

**General**
- **Name** - input de texto; edita `ws.title`. On blur/Enter guarda.
- **Color** - paleta de 8 tonos curados + opcion "Sin color" (chip con X). Al elegir un color de la paleta, el preview del workspace en el sidebar se actualiza en tiempo real. Un input hex debajo de la paleta permite introducir un color personalizado (con preview). Paleta definida como constante en `workspaceColor.ts`.

**Working Directory**
- Input de texto que edita `pinnedRoot`.
- Validacion: debounce 400ms sobre el valor + llamada a `fs_stat`. Si la carpeta no existe o no es un directorio: borde rojo + mensaje de error inline.
- Boton X (limpiar): pone `pinnedRoot` a `undefined`. Si el explorador estaba en modo "workspace", cambia a "filesystem" automaticamente.
- Boton de carpeta: abre el selector nativo de carpetas via `tauri-plugin-dialog` (`open({ directory: true, defaultPath: pinnedRoot ?? cwd })`).

**Run Configurations**
- Lista de rows; cada row: campo `name` + campo `command` + campo `cwd` opcional (inicialmente colapsado, expandible con un chevron).
- Boton "Add" al pie: crea un RunConfig nuevo con `id: crypto.randomUUID()`.
- Boton X por row para eliminar.
- Reordenacion drag-and-drop (dnd-kit, ya en el proyecto).
- Ningun campo es obligatorio para guardar; la validacion ocurre al ejecutar.

---

## 6. Sidebar de workspaces redimensionable

### Implementacion

El sidebar pasa de `w-[52px]` fijo a ancho controlado por React state:

- Estado: `workspaceSidebarWidth: number` (pixels) en `App.tsx`, cargado desde la persistencia al arrancar.
- Handle de drag: `<div>` de 4px de ancho en el borde derecho del sidebar con `cursor-ew-resize`. Listeners `onPointerDown` / `pointermove` / `pointerup` en document (con `setPointerCapture`). Actualiza el width en tiempo real; al soltar, persiste con debounce 250ms.
- Rango: min 52px, max 220px.
- Sin reestructurar el `ResizablePanelGroup` existente del tool panel + centro.

### Visualizacion adaptativa

- **Width <= 80px**: solo el chip de 2 letras, centrado (comportamiento actual).
- **Width > 80px**: chip de letras mas grande + nombre completo del workspace debajo, ambos centrados.

### Persistencia

En Rust (`src-tauri/src/modules/window_state.rs`):

```rust
pub struct IndexEntry {
    // existentes...
    pub right_panel: Option<RightPanelState>,
    // nuevo:
    pub workspace_sidebar_width: Option<u32>,
}
```

Nuevo comando Tauri `window_save_workspace_sidebar(label, width)` registrado en `lib.rs`. En el frontend, `workspaceSidebarState.ts` (patron identico a `windowUiState.ts` para el panel derecho): carga inicial desde `window_get_state`, debounce 250ms al guardar.

---

## 7. Sidebar del explorer: max width

En `src/modules/workspaces/lib/windowUiState.ts`:

```typescript
const RIGHT_PANEL_WIDTH_MAX = 70; // era 35
```

---

## 8. Color en el sidebar

### Visualizacion

- **Activo**: boton relleno con `backgroundColor: color` + `boxShadow` ring (como ahora, pero usando `color` en vez del hue auto).
- **Inactivo con color**: boton con fondo muted + franja vertical de 3px en el lado izquierdo con el color del workspace (implementado como `border-l-[3px]` con color inline o div absoluto posicionado).
- **Inactivo sin color** (`color === null`): estilo muted puro, sin franja.

### Paleta

8 colores definidos en `src/modules/workspaces/lib/workspaceColor.ts`:

```typescript
export const WORKSPACE_COLOR_PALETTE = [
  "#4f8ef7", // blue
  "#7c6af7", // violet
  "#c45af7", // purple
  "#f75a8e", // pink
  "#f7874f", // orange
  "#f7c34f", // yellow
  "#4fc97a", // green
  "#4fc9c9", // teal
];
```

Los colores exactos se ajustaran durante la implementacion para que queden bien con los temas del proyecto.

---

## 9. Boton Run en el header (F12)

### Ubicacion

En `Header.tsx`, a la derecha del titulo del workspace, antes del area de busqueda.

### Estado derivado

```typescript
// En App.tsx, derivado del workspace activo:
const activeRunConfig = activeWorkspace?.runConfigs?.find(
  r => r.id === activeWorkspace.activeRunConfigId
) ?? activeWorkspace?.runConfigs?.[0] ?? null;
```

`isRunning` se lee de `terminalEphemeralStore` para el `panelId` del `activeRunConfig`.

### Comportamiento del boton

**Sin run configs (0):**
- Boton play gris, disabled, con tooltip "Configure Run in Workspace Settings"
- Click: abre el modal de Workspace Settings en la seccion "Run Configurations"

**Con 1 run config:**
- Boton play verde. Click: ejecuta directamente.
- Si esta corriendo: boton cuadrado rojo. Click: envia `\x03` (Ctrl+C) al PTY del `panelId`.

**Con 2+ run configs:**
- Boton compuesto: `[config name ▼] [▶]`
- Click en la parte izquierda (nombre + chevron): abre dropdown para seleccionar config activo. El seleccionado queda marcado con un check. La seleccion NO ejecuta.
- Click en el triangulo verde: ejecuta el config activo.
- Si esta corriendo: triangulo se convierte en cuadrado rojo.

### Logica de ejecucion

```typescript
function runConfig(config: RunConfig) {
  const panelExists = config.panelId && findPanelGlobal(config.panelId);
  let targetPanelId: string;
  if (panelExists) {
    // navegar al panel existente
    navigateToPanel(config.panelId!);
    return;
  }
  // split del panel activo hacia abajo + lanzar comando
  // splitPaneAndOpenPanel abre un terminal vacio en un split hacia abajo
  const newPanel = splitPaneAndOpenPanel(activePaneId, "down", {
    kind: "terminal",
    cwd: config.cwd ?? activeWorkspace.pinnedRoot ?? activeWorkspace.cwd,
  });
  // Una vez montado el terminal, escribir el comando + CR al PTY via pty_write
  // (ptyBridge.write(newPanel.id, config.command + "\r"))
  targetPanelId = newPanel.id;
  // guardar panelId y marcar como running
  updateRunConfig(activeWorkspace.id, config.id, { panelId: targetPanelId });
  setTerminalRunning(targetPanelId, true);
}
```

### Estado running en `terminalEphemeralStore`

Nuevo campo `runningByPanelId: Record<string, boolean>` en `terminalEphemeralStore`. Acciones:

- `setTerminalRunning(panelId, true)` - al hacer click en Run
- `setTerminalRunning(panelId, false)` - al recibir OSC 133;D en ese panel (si `runningByPanelId[panelId]` era `true`)

Los OSC 133;C y 133;D manuales del usuario no tocan este store porque `setTerminalRunning(panelId, true)` solo se llama desde el boton Run.

---

## 10. Plugin tauri-plugin-dialog

Para el selector de carpeta nativo en el modal:

- `src-tauri/Cargo.toml`: `tauri-plugin-dialog = "2"` (patron identico al resto de plugins del proyecto)
- `src-tauri/src/lib.rs`: `.plugin(tauri_plugin_dialog::init())`
- `src-tauri/capabilities/default.json`: permiso `"dialog:default"`
- `package.json`: `"@tauri-apps/plugin-dialog": "~2.3.0"` (version ~2.3.x alineada con os/process/autostart del proyecto)

---

## Documentacion viva a actualizar

- `docs/ARCHITECTURE.md`: nuevos campos `color`, `runConfigs`, `activeRunConfigId` en el modelo `Workspace`; boton Run en `header/`; estado `isRunning` en `terminalEphemeralStore`; sidebar redimensionable.
- `docs/IPC.md`: nuevo comando `window_save_workspace_sidebar`.
- `docs/WORKSPACES.md`: cambio de `ExplorerRootMode` de 3 a 2 valores; eliminacion de `pinnedRoot` como modo separado.
- `docs/FORK.md`: feature F12 (run configs, boton Run) como divergencia del upstream.
- `AGENTS.md`: si el boton Run se implementa como subcomponente nuevo en `header/`.

---

## Criterios de aceptacion

- Clic derecho en cualquier workspace muestra el menu contextual con los 3 items e iconos.
- Rename inline funciona via menu contextual y via shortcut `Cmd+Shift+R`.
- El modal de Workspace Settings abre via menu contextual y via `Cmd+Shift+,`.
- El modal permite editar nombre, color (paleta + custom hex + sin color), `pinnedRoot` (con validacion + folder picker nativo + borde rojo si no existe + boton X), y run configs (add/remove/reorder).
- El color del workspace se muestra como franja fina en workspaces inactivos y como relleno en el activo.
- El sidebar de workspaces es redimensionable (52-220px); el ancho se persiste por ventana y se recupera al arrancar.
- En modo ancho (>80px) los items muestran el nombre completo debajo del chip.
- El sidebar del explorer tiene max width 70%.
- El modo "pinned" del explorador desaparece; workspaces existentes migran a "workspace".
- El modo "workspace" del explorador aparece disabled si `pinnedRoot` no esta definido.
- El boton Run en el header muestra el estado correcto (play/stop) y ejecuta el run config en un panel terminal (split del activo si no habia panel previo).
- `pnpm lint`, `pnpm check-types`, `pnpm test` en verde; `cargo clippy`, `cargo test --locked` en verde.

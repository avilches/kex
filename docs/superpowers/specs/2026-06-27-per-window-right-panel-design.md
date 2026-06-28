# Estado del panel derecho por ventana

## Contexto

La app es multi-ventana: el usuario abre varias ventanas principales del SO (File > New Window,
Cmd+Shift+N), cada una con su propia instancia React y label `w-<id>`. El estado por ventana
(geometria + Workspaces + indice activo) ya se persiste en Rust en `{app_data_dir}/workspaces.json`
(indice) mas `{app_data_dir}/workspaces/<id>.json` (bodies), keyed por label, y se restaura al arrancar.

Sin embargo, varios ajustes del panel derecho (Explorer / Git / History) viven hoy como preferencias
**globales** en `settings-general.json`, asi que se comparten entre todas las ventanas. El objetivo es
que pasen a ser por ventana (o por workspace, segun el ajuste), persistibles y restaurables.

La app esta en desarrollo: no hay instalaciones que migrar. Se eliminan las claves globales viejas sin
fallback de retrocompatibilidad.

## Reparto de ajustes

| Ajuste | Hoy | Destino |
|---|---|---|
| `rightPanelActiveTab` (Explorer/Git/History) | global | por ventana |
| `rightPanelOpen` (abierto/colapsado) | global | por ventana |
| `rightPanelWidth` (ancho) | global | por ventana |
| `panelSide` (izquierda/derecha) | global | por ventana |
| `showHidden` (mostrar ocultos) | global | por workspace |
| `explorerRootMode` (filesystem/worktree) | ya por workspace | sin cambio (verificar persistencia) |

Razon de la granularidad: el chrome del panel derecho (que vista, abierto, ancho, lado) es una propiedad de
la ventana, compartida por todas sus pestanas de workspace. En cambio, `showHidden` y `explorerRootMode` son
ajustes del explorer y cada workspace apunta a un proyecto distinto, asi que se recuerdan por workspace.
`explorerRootMode` ya es por workspace y ya persiste; solo se mueve `showHidden` de global a por workspace.

## Modelo de datos

### Por ventana (chrome del panel derecho)

Reusar el blob ya persistido por ventana. En Rust (`src-tauri/src/modules/window_state.rs`), `WindowEntry`
e `IndexEntry` ganan un campo opcional pequeno que vive en el indice `workspaces.json` (no en los bodies):

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RightPanelState {
    pub open: bool,
    pub active_tab: String, // "explorer" | "git" | "history"
    pub width: u32,
    pub side: String,       // "left" | "right"
}
// WindowEntry e IndexEntry: pub right_panel: Option<RightPanelState>
```

`Option` para que cualquier indice sin el campo deserialice a `None` y caiga a defaults. (No es migracion:
es robustez de deserializacion.)

### Por workspace (explorer)

En el tipo `Workspace` (`src/modules/workspaces/lib/types.ts`):

```typescript
showHidden?: boolean; // undefined = default
// explorerRootMode ya existe
```

## Almacenamiento y persistencia

### Por ventana

`window_save_workspace_state` serializa el array completo de workspaces, demasiado pesado para disparar al
cambiar de pestana o redimensionar. Se anade un comando ligero dedicado que solo toca los campos del indice:

```rust
#[tauri::command]
fn window_save_right_panel(app, label: String, open: bool, active_tab: String, width: u32, side: String) {
    let mgr = app.state::<WindowStateManager>();
    mgr.update_right_panel(&label, RightPanelState { open, active_tab, width, side });
    mgr.save(); // reescribe solo el indice workspaces.json, no los bodies
}
```

Se lee en el arranque via el `window_get_state` existente (el `WindowEntry` ahora incluye `rightPanel`).
Frontend: el tipo `WindowEntry` (TS) gana `rightPanel?`.

### Por workspace (`showHidden`)

No necesita comando nuevo: viaja dentro de cada `Workspace` por el `saveWorkspaceState()` /
`sanitizeWorkspace()` existentes, igual que `explorerRootMode`. Cero superficie IPC nueva.

### Nota sobre `width`

La pref global `rightPanelWidth` (240 px) nunca estuvo cableada al panel real: el `ResizablePanel`
renderiza con `defaultSize="20%"`. Por tanto "ancho por ventana" se cablea de verdad: el `ResizablePanel`
usa `defaultSize={width}` y persiste con `onResize={(size) => setWidth(size)}`. `width` pasa a almacenar el
valor de tamano que reporta `react-resizable-panels` (porcentaje entero), default 20 (no 240 px).

### Nota sobre `side` y la ventana de Settings

El control "Sidebar position" de `AppearanceSection` (ventana de Settings) escribe hoy la pref global
`panelSide`. La ventana de Settings es independiente y no sabe a que ventana principal apuntar, asi que con
`side` por ventana ese control se retira de Settings. El cambio de lado se hace desde el toggle del Header de
cada ventana principal (`App.tsx`), que ya opera sobre la ventana activa y ahora llama a `setSide`.

### Debounce

El guardado por ventana del panel reusa un debounce corto (200-300 ms) para no escribir en cada pixel de
resize. El de workspace ya esta cubierto por el debounce de `saveWorkspaceState` (800 ms).

## Cableado en el frontend

### Estado por ventana del panel (chrome)

Hoy `RightPanel`/`App` leen `rightPanelActiveTab/open/width/panelSide` de `usePreferencesStore`. Se sustituye
por estado React a nivel de ventana, en un modulo aislado (functional core + shell fino):

- Nuevo modulo `src/modules/workspaces/lib/windowUiState.ts`: cache + carga (`window_get_state`) +
  `saveRightPanelState(label, state)` con debounce, espejo de `workspaceState.ts`.
- Nuevo hook `useRightPanelState(label)`: mantiene `{ open, activeTab, width, side }`, seed desde el
  `WindowEntry` restaurado, fallback a defaults. Expone `setOpen`, `setActiveTab`, `setWidth`, `setSide`,
  cada uno persiste con debounce.
- `App.tsx` pasa estos valores y setters por props a `RightPanel` y al `ResizablePanel` del panel.
  `RightPanel` deja de tocar el store y recibe `activeTab` + `onChangeActiveTab` por props. El handle de
  resize llama a `setWidth`. El toggle de abrir/cerrar llama a `setOpen`. El cambio de lado llama a `setSide`,
  y App usa `side` (en vez del `panelSide` global) para decidir el orden izquierda/derecha del layout.

### `showHidden` por workspace

Espejo exacto de `explorerRootMode`:

- Funcion pura `applyShowHidden(workspaces, workspaceId, value)` en `useWorkspaces.ts` (gemela de
  `applyExplorerRootMode`).
- Setter `setShowHidden(workspaceId, value)` en `useWorkspaces`, y handler en `App` sobre `activeWorkspace`
  (como `handleChangeRootMode`).
- `App` deriva `activeShowHidden = activeWorkspace?.showHidden ?? false` y lo pasa por props a `RightPanel`
  -> `FileExplorer`. `FileExplorer` deja de leer `usePreferencesStore((s) => s.showHidden)` y su boton del
  toolbar llama al handler por props.

### Limpieza de preferencias globales

Se eliminan de `Preferences` y de `settings-general.json` (sin fallback): `rightPanelOpen`,
`rightPanelWidth`, `rightPanelActiveTab`, `panelSide`, `showHidden`, junto con sus setters
(`setRightPanelOpen`, `setRightPanelWidth`, `setRightPanelActiveTab`, `setPanelSide`, `setShowHidden`) y sus
claves (`KEY_*`).

### Defaults

- Panel: `open=true`, `activeTab="explorer"`, `width=20` (porcentaje del panel-group), `side="left"`.
- Workspace: `showHidden=false`.

## Edge cases

- Ventana Settings (label `settings`): no tiene panel derecho ni workspaces; nunca llama a los nuevos
  comandos. Sin impacto.
- Ventana nueva (Cmd+Shift+N): sin entrada previa -> defaults. Cada ventana evoluciona su estado de forma
  independiente; sin carreras porque cada una escribe su propio `label` (el `WindowStateManager` ya
  serializa accesos).
- `active_tab` / `side` invalidos al deserializar -> se validan y caen a `"explorer"` / `"left"`.
- Resize rapido -> el debounce evita tormenta de escrituras; el ultimo valor gana.

## Testing

Locks de invariantes (segun el quality bar del repo: cambios en git/workspace/IPC necesitan test):

- Rust (`window_state.rs`): round-trip serde de `WindowEntry`/`IndexEntry` con y sin `right_panel`; un
  indice sin el campo deserializa a `None`; `update_right_panel` persiste y `get_entry` lo recupera.
- Frontend (Vitest): `applyShowHidden` (pura), gemela de los tests de `applyExplorerRootMode`; validacion
  de `active_tab` / `side` invalidos cayendo a `"explorer"` / `"left"`.
- Verificacion final: `pnpm lint`, `pnpm check-types`, `pnpm test`, `cargo clippy`, `cargo test --locked`.

## Docs vivas a actualizar en el mismo commit

- `docs/ARCHITECTURE.md`: estado por ventana (chrome del panel) vs por workspace (explorer); nota de que
  `showHidden` paso de global a por workspace.
- `docs/IPC.md`: nuevo comando `window_save_right_panel`.
- `AGENTS.md`: ya actualizado para reflejar la arquitectura multi-ventana.

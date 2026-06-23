# Workspace sin tabs (close-last-tab)

## Objetivo

Permitir que un workspace siga existiendo sin ningun tab abierto. Cerrar el ultimo
tab ya no cierra el workspace: deja el workspace vivo con un pane vacio que muestra
una pantalla de bienvenida con acciones rapidas. El workspace solo se cierra con una
accion explicita (`Cmd+W` sobre un workspace vacio), opcionalmente confirmada.

## Comportamiento actual (punto de partida)

Cadena de cierre de un tab:

1. `PaneTabBar` -> `onClose(panelId)` -> `App.onClosePanelStable` -> `closePanels`.
2. `useTabCloseGuards.closePanels` aplica guards (editor dirty, terminal con proceso)
   y llama `disposePanel` -> `useWorkspaces.closePanel(workspaceId, panelId)`.
3. `closePanel` (`lib/useWorkspaces.ts:331-383`):
   - Si quedan panels en el pane: actualiza `panels` y reelige `activePanelId`.
   - Si era el ultimo panel del pane: `removePaneFromTree`.
     - Si quedan panes hermanos: colapsa el split, mantiene el workspace.
     - Si era el unico pane: `return []` -> **elimina el workspace**.
4. `useEffect` (`useWorkspaces.ts:113-120`): si `workspaces.length === 0` ->
   `window.destroy()` cierra la app.

Hoy un pane vacio (`panels: []`, `activePanelId: null`) solo existe de forma
transitoria; `PaneView.tsx:291-295` ya tiene un placeholder "Empty pane".

## Decisiones de diseno (acordadas)

1. **Split**: al cerrar el ultimo tab de un pane que comparte split, el pane colapsa
   como ahora (el hermano ocupa el espacio). Solo el **pane unico** del workspace
   puede quedar vacio. Es decir, un pane vacio implica workspace vacio.
2. **Cerrar tabs nunca cierra el workspace.** Cerrar el ultimo tab deja el workspace
   vacio con pantalla de bienvenida.
3. **Cerrar workspace**: `Cmd+W` sobre un workspace vacio cierra el workspace, con un
   modal de confirmacion opcional ("Don't ask me again" persiste el flag).
4. **Ultimo workspace**: `Cmd+W` sobre el unico workspace vacio cierra la app (tras la
   confirmacion si esta activa). La app tambien se cierra con el control nativo de
   ventana. No se puede quedar con cero workspaces de otra forma.
5. **Pantalla de bienvenida**: acciones clicables con su shortcut visible (New
   Terminal, New Browser, Search Files, Command Palette, Settings).

Fuera de alcance (YAGNI): no se anade un boton "cerrar workspace" en el sidebar; la
unica via de cierre es `Cmd+W` sobre el workspace vacio.

## Diseno

### 1. Functional core: cierre de panel

`useWorkspaces.closePanel()` deja de eliminar workspaces. En el caso "ultimo panel
del unico pane" (hoy `if (!newTree) return []`), en su lugar mantiene el workspace con
el pane unico vaciado:

```
paneTree: updatePane(w.paneTree, pane.id, (p) => ({
  ...p,
  panels: [],
  activePanelId: null,
}))
```

El resto de ramas (quedan panels, o colapso de panes hermanos via
`removePaneFromTree`) no cambian. Tras este cambio `closePanel` nunca devuelve `[]`
ni reduce el numero de workspaces.

### 2. Functional core: nueva accion `closeWorkspace`

Nueva funcion en `useWorkspaces`:

```
closeWorkspace(workspaceId: string): void
```

- Elimina el workspace del array.
- Reelige `activeWorkspaceId` usando la misma logica que hoy vive embebida en
  `closePanel` (volver al `previousWorkspaceId` si sigue existiendo; si no, el de la
  misma posicion / anterior). Se extrae a un helper compartido
  (`pickNextActiveWorkspaceId`) reutilizado por ambos sitios; tras el cambio del punto
  1, esa logica de reseleccion ya solo la usa `closeWorkspace`.
- Si tras eliminar quedan 0 workspaces, el `useEffect` existente
  (`workspaces.length === 0 -> window.destroy()`) cierra la app sin cambios.

### 3. Cmd+W contextual (`tab.close`)

`handleCloseActivePanel` (`App.tsx:1517`) ramifica segun el pane activo:

- Pane activo con tabs (`activePanelId != null`): comportamiento actual (cierra el
  panel activo, respetando lock y guards).
- Pane activo vacio (`activePanelId == null`): dispara el flujo de cerrar workspace
  (`requestCloseWorkspace(activeWorkspace.id)`).

No se modifica el registry de shortcuts: `tab.close` ("Close Tab or Pane", `Cmd+W`)
solo cambia su efecto segun contexto.

### 4. Confirmacion de cierre de workspace

**Flag** en `settings/store.ts`, replicando el patron de
`warnOnCloseTabWithRunningProcess`:

- Campo `warnOnCloseWorkspace: boolean` en `Preferences`, default `true`.
- `KEY_WARN_ON_CLOSE_WORKSPACE` y `setWarnOnCloseWorkspace(value)`.

**UI** en `GeneralSection.tsx`: `SettingRow` + `Switch`:

- Title: "Warn when closing a workspace"
- Description: "Confirm before closing a workspace with no open tabs."

**Modal** en `CloseDialogs.tsx`: nuevo `AlertDialog` con el mismo estilo que el de
terminal:

- Title: "Close this workspace?"
- Description adaptada: si es el ultimo workspace, indica que se cerrara la app.
- Checkbox "Don't ask me again" -> `setWarnOnCloseWorkspace(false)`.
- Cancel / Close.

**Cableado** en `App.tsx`:

- Estado `pendingCloseWorkspace: { id: string; isLast: boolean } | null`.
- `requestCloseWorkspace(id)`: si `warnOnCloseWorkspace` esta activo, abre el modal;
  si no, llama `closeWorkspace(id)` directo.
- Confirmacion del modal -> aplica `dontAskAgain` y llama `closeWorkspace(id)`.

### 5. Pantalla de bienvenida del pane vacio

Nuevo componente `EmptyPaneWelcome` en el modulo workspaces que reemplaza el
placeholder de `PaneView.tsx:291-295`. Acciones, cada una con su shortcut visible via
`getShortcutLabel(id, userShortcuts)`:

| Accion           | Shortcut id            |
|------------------|------------------------|
| New Terminal     | `tab.new`              |
| New Browser      | `tab.newBrowser`       |
| Search Files     | `explorer.search`      |
| Command Palette  | `commandPalette.open`  |
| Settings         | `settings.open`        |

Cada accion invoca el handler real ya existente, pasado desde `App.tsx` a traves del
arbol de PaneView (un objeto `welcomeActions` o callbacks individuales). El tab bar del
pane sigue visible (vacio, con su boton `+`). Los botones son focusables por teclado.

### 6. Persistencia y restore

- Verificar que `sanitizeWorkspace` (`workspaceState.ts`) acepta panes vacios
  (`panels: []`, `activePanelId: null`) sin perder el workspace ni asumir un
  `activePanelId` no nulo.
- El restore reconstruye un workspace vacio mostrando la pantalla de bienvenida.
- Un workspace vacio se persiste y se restaura como tal.

## Modulos / ficheros afectados

- `src/modules/workspaces/lib/useWorkspaces.ts` (closePanel, closeWorkspace, helper).
- `src/modules/workspaces/lib/workspaceState.ts` (sanitize panes vacios).
- `src/modules/workspaces/PaneView.tsx` (render de EmptyPaneWelcome).
- `src/modules/workspaces/EmptyPaneWelcome.tsx` (nuevo).
- `src/app/App.tsx` (handleCloseActivePanel contextual, requestCloseWorkspace,
  pendingCloseWorkspace, threading de welcomeActions).
- `src/app/components/CloseDialogs.tsx` (modal de cierre de workspace).
- `src/modules/settings/store.ts` (flag warnOnCloseWorkspace).
- `src/settings/sections/GeneralSection.tsx` (toggle del flag).

## Tests

- `closePanel`: cerrar el ultimo panel del unico pane deja el workspace con pane vacio
  (`panels: []`, `activePanelId: null`) y NO reduce el numero de workspaces.
- `closePanel`: cerrar el ultimo panel de un pane en un split sigue colapsando el
  hermano (sin cambios).
- `closeWorkspace`: elimina el workspace y reelige el activo (anterior / misma
  posicion); cerrar el ultimo workspace deja `workspaces.length === 0`.
- Helper `pickNextActiveWorkspaceId`: casos de reseleccion.

## Documentacion

- `docs/ARCHITECTURE.md`: ciclo de vida workspace/pane (los panes pueden persistir
  vacios; un workspace puede existir sin tabs; via de cierre).
- `docs/FORK.md`: feature divergente respecto al upstream.
- Listar `warnOnCloseWorkspace` donde corresponda en la doc de settings.

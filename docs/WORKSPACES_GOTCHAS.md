# Workspaces — bugs encontrados y cómo se resolvieron

Este documento registra los problemas de la capa workspace/terminal que resultaron no obvios de
diagnosticar. El objetivo es que no haya que re-descubrirlos.

Para entender cómo funciona el sistema, lee primero [WORKSPACES.md](WORKSPACES.md).

---

## Bug 1: tabs del pane inferior no responden al click (RESUELTO)

### Síntoma

Cuando hay dos panes apilados verticalmente (uno arriba, uno abajo), los tabs del pane inferior
no responden al click de forma intermitente.

### Causa raíz

`react-resizable-panels` registra un listener en **capture phase** sobre `document`:

```javascript
document.addEventListener("pointerdown", De, true)  // capture = true
```

La función `De` llama a `e.preventDefault()` si el puntero está dentro del hit region del
separador. El separador visual tiene `h-px` (1px). La librería impone un mínimo de 10px
(`resizeTargetMinimumSize: { fine: 10 }`), por lo que expande el hit region:

```
expansion = (10 - 1) / 2 = 4.5px
hit region efectivo: separador.y - 4.5 a separador.y + 5.5
```

Esos ~5.5px se meten dentro del tab bar del pane inferior. Cuando `preventDefault()` se llama en
`pointerdown` capture (antes de cualquier handler de React), **WebKit suprime el evento `click`**
(y probablemente también `pointerup` en WKWebView, a diferencia del spec W3C).

### Fix

`src/components/ui/resizable.tsx`: separador horizontal `h-[10px]` con fondo transparente y línea
visual 1px centrada vía `::after`. A exactamente 10px, la librería no expande el hit region y
termina justo donde empieza el tab bar.

### Intentos fallidos

**Experimento 1 (empeoró):** reemplazar `onClick` en `DraggableTab` por `onPointerDown` +
`onPointerUp`, reenviando el evento a dnd-kit manualmente. Rompió todos los tabs porque el
synthetic event de React no es compatible con la máquina de estados de dnd-kit.

**Experimento 2 (no resolvió):** fallback `onPointerUp` a nivel del contenedor `PaneTabBar`,
usando `data-panel-id` para identificar el tab y activarlo si el movimiento fue < 6px. No fue
suficiente porque WebKit en WKWebView probablemente también suprime `pointerup` cuando
`preventDefault()` fue llamado en capture, al contrario del spec.

**Opción B (descartada):** listener capture en `document` con `stopImmediatePropagation()` para
bloquear al de react-resizable-panels. Descartada porque el orden de registro depende del orden de
montado, lo que lo hace frágil.

---

## Bug 2: drag de tabs falla intermitentemente (RESUELTO)

### Síntoma

Al intentar arrastrar un tab, el cursor de grab aparece brevemente y el drag se cancela antes de
activarse. Ocurre solo a veces, no siempre.

### Causa

El tab bar tiene `overflow-x: auto`. WebKit (WKWebView en Tauri) detecta el movimiento inicial
como un posible scroll horizontal y emite `pointercancel`, cancelando el drag de dnd-kit antes de
que alcance el umbral de activación de 6px. Ocurre intermitentemente porque depende del ángulo del
primer movimiento: más horizontal = más probable que WebKit lo interprete como scroll.

### Fix

`touch-action: none` (`touch-none` clase Tailwind) en `DraggableTab`. Deshabilita el handling
por defecto de touch/pointer del browser para ese elemento, impidiendo que WebKit emita
`pointercancel`. Esto está recomendado explícitamente en la documentación de dnd-kit para
elementos en contenedores scrollables.

### Notas de diagnóstico

- Añadir `onDragCancel` al `DndContext` era necesario: sin él, el estado de `draggingItem`
  quedaba colgado si el drag se cancelaba con Escape.
- El linter (Biome) eliminó `cursor-grab` del className en varias ocasiones durante el diagnóstico.
  La clase debe estar presente junto con `active:cursor-grabbing` y `touch-none`.
- Se añadió un `useEffect` en `WorkspaceView` con listeners capture para `pointerdown`,
  `pointermove`, `pointerup`, `pointercancel` a nivel `document` para depuración. Está pendiente
  de eliminar cuando se confirme estabilidad definitiva.

---

## Bug 3: "Too many active WebGL contexts" (RESUELTO)

### Síntoma

Warning en consola: `There are too many active WebGL contexts on this page, the oldest context
will be lost.` El terminal más antiguo cae silenciosamente al renderer DOM (más lento).

### Causa raíz

En `PaneView.tsx`, `visible={tab.id === pane.activeTabId}` no consideraba si el workspace
estaba activo. Todos los workspaces (activos e inactivos) mantenían sus paneles activos con
`visible=true`, conservando cada uno su contexto WebGL indefinidamente. WKWebView en macOS permite
~8-16 contextos simultáneos. Con varios workspaces con varios panes se llegaba al límite con
facilidad.

### Relación con el bug 2

Posiblemente contributiva, aunque no es la causa principal. Cuando un contexto WebGL se pierde,
`onContextLoss` dispara `addon.dispose()` y programa una recuperación que modifica el DOM (elimina
y recrea el canvas del terminal). Esta mutación del DOM durante un drag podría haber interferido
con el pointer tracking de dnd-kit en algunos casos. El `touch-none` del bug 2 es la causa
primaria.

### Fix

1. `PaneView.tsx`: `visible={tab.id === pane.activeTabId && isWorkspaceActive}`. Workspaces
   inactivos liberan sus slots; el estado se serializa como snapshot y se restaura al volver.

2. `rendererPool.ts`: constante `WEBGL_MAX_CONTEXTS = 7`. Antes de crear un nuevo contexto WebGL,
   si ya hay 7 activos, se libera el slot idle más antiguo. Si todos están en uso, se omite el
   attach (el slot usa DOM renderer). Red de seguridad para patrones de uso no cubiertos por el
   fix anterior.

### Aclaración: no hay límite de tabs

No hay límite en el número de tabs abiertos. El límite es de contextos WebGL activos
simultáneamente. El número de contextos activos en condiciones normales es:

```
contextos activos ≈ número de panes en el workspace activo
```

Tabs no-activos dentro de un pane tienen `visible=false` y no consumen contexto. Workspaces
inactivos ídem desde el fix anterior.

---

## Bug 4 (RESUELTO): WebGL no se adjunta al arrancar

Ver documentación completa en [`docs/WORKSPACES_GPU.md`](WORKSPACES_GPU.md).

**Fix**: `retryMissingWebgl()` llamada desde `main.tsx` a t=350ms (300ms tras `showWindow`).
A ese tiempo la GPU surface de WKWebView ya está lista. El badge de debug usa
`useSyncExternalStore` para reflejar el estado reactivamente.
## Bug 4b: geometría de ventana — tamaño se restaura, posición descartada (RESUELTO PARCIALMENTE)

### Estado final

**Tamaño**: se guarda en pixels físicos (`inner_size()`) y se restaura con `set_size(PhysicalSize)`
llamado desde un comando IPC (`restore_window_geometry`) invocado en `main.tsx` antes del `show()`
— equivalente al `on_window_ready` del plugin oficial. Funciona de forma fiable.

**Posición**: descartada intencionalmente. Restaurar posición en macOS resultó demasiado frágil
para el riesgo que supone (ventana fuera de pantalla al cambiar de monitor). macOS coloca la
ventana automáticamente.

### Historial de problemas encontrados

#### Save: `if let` triple falla silenciosamente

El handler `CloseRequested` original agrupaba tres llamadas en un solo `if let`:

```rust
if let (Ok(pos), Ok(inner), Ok(scale)) =
    (w.outer_position(), w.inner_size(), w.scale_factor())
```

Si cualquiera falla, el bloque completo se omite. En particular `scale_factor()` puede fallar
cuando el WebKit ya está parcialmente desmontado al cerrar. La geometría queda en el valor por
defecto del JSON (0×0 o 1280×800).

**Fix**: separar las llamadas. `scale_factor()` con `unwrap_or(1.0)`.

#### Save: geometría no se persiste si el proceso se mata (Ctrl-C en dev)

`CloseRequested` no se dispara cuando el proceso se termina por señal. El JSON quedaba con los
valores por defecto creados en `add_window()`.

**Fix**: guardar geometría también en `WindowEvent::Focused(true)` y `Resized` para que la
última geometría conocida quede en disco aunque la app sea matada.

#### Save/restore: unidades mezcladas (físico vs lógico)

`outer_position()` e `inner_size()` devuelven pixels físicos. `WebviewWindowBuilder::inner_size()`
y `.position()` esperan pixels lógicos. En Retina 2×, guardar físico (2560×1600) como lógico
producía una ventana de 5120×3200 (el doble del monitor).

**Fix**: para el tamaño, `inner_size()` (físico) se pasa directamente a `set_size(PhysicalSize)`.
Para posición se intentó `to_logical(scale)` pero se descartó junto con la posición.

#### Restore de posición: macOS cascade sobreescribe cualquier posición pre-show

macOS aplica cascade (reposicionamiento automático) cuando muestra una ventana. Probado y fallido:

- **`builder.position(x, y)`**: ignorado por cascade en `orderFront:`.
- **`set_position()` antes de `show()`**: frame aplicado en ventana oculta, descartado al mostrar.
- **`set_position()` justo después de `show()` (síncrono)**: `orderFront:` es asíncrono en Cocoa;
  la llamada llega antes de que AppKit procese el show.
- **`set_position()` en `Focused(true)`**: funciona a veces pero no de forma fiable en todos los
  ciclos (dependiendo del estado de focus al arrancar con múltiples ventanas).
- **`restore_window_geometry` IPC desde `main.tsx` con `PhysicalPosition`**: funciona en algunos
  casos pero inconsistente según el monitor y el orden de creación de ventanas.

El plugin oficial (`tauri-plugin-window-state`) usaba `WindowEvent::Ready` de Tauri 1 para esto.
En Tauri 2 ese evento no existe. Sin un equivalente fiable, la restauración de posición es
demasiado frágil para el riesgo de dejar ventanas fuera de pantalla en configuraciones
multi-monitor o al cambiar de monitor.

**Decisión**: no restaurar posición. macOS coloca las ventanas automáticamente.

---

## Bug 6: cerrar el ultimo tab no cierra la ventana (RESUELTO)

### Sintoma

Al cerrar el ultimo tab del ultimo workspace, la UI queda vacia pero la ventana permanece abierta.
Tras el intento fallido, el boton rojo de macOS tambien deja de funcionar.

### Causa raiz

`Window.destroy()` llama internamente a `invoke('plugin:window|destroy', { label })`. Este IPC esta
controlado por el sistema de capabilities de Tauri 2. **`core:window:allow-destroy` no estaba en
`src-tauri/capabilities/default.json`**, por lo que cada llamada era rechazada con permiso denegado.
El `void` alrededor de `destroy()` suprimia el error, haciendo el fallo invisible.

El boton rojo se rompia porque `flushing = true` se establecia en `onCloseRequested` antes de llamar
`destroy()` y nunca se reseteaba al fallar. Con `flushing` atascado en `true`, el siguiente click
al boton X retornaba por el early-return path sin cerrar.

### Fix

1. Agregar `"core:window:allow-destroy"` a `src-tauri/capabilities/default.json`.
2. En `onCloseRequested`, usar `await destroy()` (no `void`) con `catch { flushing = false }` para
   que el boton rojo siempre pueda reintentar si destroy fallara.
3. En `useWorkspaces.ts`, agregar `useEffect` que detecta `workspaces.length === 0` y llama
   `destroy()` (bypass de `onCloseRequested`), y quitar el guard `if (prev.length <= 1) return prev`.

Historia completa con los 6 intentos: [CLOSE_WINDOW_GOTCHAS.md](CLOSE_WINDOW_GOTCHAS.md).

### Leccion

Antes de usar cualquier API de Tauri 2 que puede fallar silenciosamente (especialmente con `void`),
verificar que el permiso correspondiente (`core:window:allow-*`) este en `capabilities/default.json`.
`close()` ya estaba permitido pero `destroy()` requiere un permiso separado.

---

## Estado de archivos tras todos los fixes

| Archivo | Cambio |
|---|---|
| `src/components/ui/resizable.tsx` | Separador horizontal `h-[10px]`, fondo transparente, linea visual 1px via `::after` |
| `src/modules/workspaces/PaneTabBar.tsx` | `onClick` en `DraggableTab` + fallback `onPointerUp` en contenedor; `touch-none` y `cursor-grab` en `DraggableTab` |
| `src/modules/workspaces/PaneView.tsx` | `visible={...isWorkspaceActive}`; badge GPU via `useSyncExternalStore` |
| `src/modules/workspaces/WorkspaceView.tsx` | `onDragCancel` en `DndContext`; `document.body.style.cursor` sincrónico durante drag |
| `src/modules/terminal/lib/rendererPool.ts` | `WEBGL_MAX_CONTEXTS = 7`; `retryMissingWebgl()`; `subscribeToPool()`/`notifyPool()` |
| `src/main.tsx` | `setTimeout(retryMissingWebgl, 350)` tras `showWindow`; `onCloseRequested` usa `await destroy()` con reset de flushing en error |
| `src/modules/workspaces/lib/useWorkspaces.ts` | `useEffect` cierre por workspaces vacios + navegacion adyacente en closeWorkspace/closeTab |
| `src-tauri/capabilities/default.json` | `core:window:allow-destroy` agregado |

---

## Bug 7: el scratchpad no recibe el foco (nuevos terminales y restore) (RESUELTO)

### Sintoma

Con la preferencia "scratchpad en terminales nuevos" activa, la barra del scratchpad aparecia pero
el cursor se quedaba en el terminal. Al cambiar entre tabs del **mismo pane** (uno oculto), el
scratchpad "cogia y perdia" el foco. Al reiniciar, los tabs con scratchpad abierto se robaban el
foco entre si y se activaba un tab distinto al que estaba activo al cerrar. En split (dos panes
visibles) si funcionaba, lo que despisto el diagnostico.

### Causa raiz

Tres focos compitiendo, ninguno consciente de que el scratchpad podia ser el "lado activo":

1. `ScratchpadBar` hacia `el.focus()` en su `useEffect` de montaje **incondicionalmente**. En el
   restore, cada tab con scratchpad abierto (incluso ocultos) montaba su barra y robaba el foco,
   activando otro tab.
2. `scheduleUnhide` (`rendererPool.ts`), al hacer visible un slot, ejecutaba `slot.term.focus()`
   tras un doble `requestAnimationFrame` si el leaf estaba enfocado. Eso pisaba el foco del
   scratchpad justo despues de que lo tomara (de ahi "lo coge y lo pierde"). En split no se dispara
   porque no hay ciclo de ocultar/mostrar.
3. El efecto de foco re-tomaba el foco en cada ejecucion mientras el pane estaba enfocado, y su
   `setTimeout` diferido podia dispararse despues de que el pane perdiera el foco.

El sintoma fue dificil de aislar porque el tag de debug inicial (estado en el titulo del tab) estaba
roto: `subscribeLeafScratchpad` devolvia un no-op cuando la sesion aun no existia al suscribirse, asi
que mostraba `---` siempre y sugeria (en falso) que el scratchpad no se abria.

### Fix

- `SlotAdapter.focusLeaf(leafId)` centraliza el foco: enfoca el scratchpad si esta abierto y es el
  lado activo (`scratchpadActive`), si no el slot del terminal. `scheduleUnhide` y el efecto de foco
  lo usan en vez de `slot.term.focus()` / `focusSlot` a ciegas.
- `ScratchpadBar` ya no hace `el.focus()` al montar; solo registra el callback de foco. El foco lo
  decide la sesion (`focusLeaf`, transicion a focused, ciclo `Cmd+U`).
- El efecto de foco solo actua en la transicion no-focused -> focused y su `setTimeout` aborta si el
  leaf ya no es el visible/enfocado.

`scratchpadActive` ("focused" persistido) es una **preferencia de lado**, no el foco global: "si este
pane gana el foco, ponlo en el scratchpad". Solo el tab activo toma el foco.

## Bug 8: la navegacion por teclado entre workspaces no sigue el orden visual (RESUELTO)

### Sintoma

Tras introducir los grupos de status (y permitir colapsarlos), `workspace.next`/`workspace.prev`
(Cmd+Alt+abajo/arriba) saltaban entre workspaces en un orden que no coincidia con el de la barra
lateral. `workspace.selectByIndex` (Cmd+1..9) podia ademas saltar a un workspace oculto dentro de un
grupo colapsado.

### Causa raiz

El array de estado `workspaces` conserva el orden de creacion/drag: `applyWorkspaceStatus` solo
cambia el campo `statusId` en su sitio, nunca reordena. La sidebar, en cambio, **reagrupa** ese array
para pintar (primero el grupo sin status, luego cada status en el orden de `workspaceStatuses`). Con
grupos, esos dos ordenes dejan de coincidir. La navegacion recorria el array crudo en vez del orden
visual derivado, y `selectByIndex` indexaba el array global sin filtrar colapsados.

Antes de los grupos, array y orden visual coincidian 1:1, por eso nunca habia fallado.

### Fix

`modules/workspaces/lib/workspaceOrder.ts` concentra el calculo del orden:

- `groupWorkspaces(workspaces, statuses)`: agrupacion visual (la usa la sidebar para pintar).
- `visibleWorkspaceOrder(workspaces, statuses, collapsedGroups, activeId)`: el orden visual aplanado
  de lo que realmente se ve. Un grupo colapsado aporta solo su miembro activo (la unica fila que
  renderiza), el resto aporta todas sus filas.

`cycleWorkspace` y `workspace.selectByIndex` (`App.tsx`) navegan sobre `visibleWorkspaceOrder`, asi
que el orden de teclado es identico al visual y los miembros ocultos de un grupo colapsado se omiten.
La sidebar usa `groupWorkspaces`, de modo que la agrupacion vive en un unico sitio y no puede volver
a desincronizarse.

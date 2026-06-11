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

- Añadir `onDragCancel` al `DndContext` era necesario: sin él, el estado de `draggingPanel`
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

En `PaneView.tsx`, `visible={panel.id === pane.activePanelId}` no consideraba si el workspace
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

1. `PaneView.tsx`: `visible={panel.id === pane.activePanelId && isWorkspaceActive}`. Workspaces
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

## Estado de archivos tras todos los fixes

| Archivo | Cambio |
|---|---|
| `src/components/ui/resizable.tsx` | Separador horizontal `h-[10px]`, fondo transparente, línea visual 1px vía `::after` |
| `src/modules/workspaces/PaneTabBar.tsx` | `onClick` en `DraggableTab` + fallback `onPointerUp` en contenedor; `touch-none` y `cursor-grab` en `DraggableTab` |
| `src/modules/workspaces/PaneView.tsx` | `visible={...isWorkspaceActive}`; badge GPU via `useSyncExternalStore` |
| `src/modules/workspaces/WorkspaceView.tsx` | `onDragCancel` en `DndContext`; `document.body.style.cursor` sincrónico durante drag |
| `src/modules/terminal/lib/rendererPool.ts` | `WEBGL_MAX_CONTEXTS = 7`; `retryMissingWebgl()`; `subscribeToPool()`/`notifyPool()` |
| `src/main.tsx` | `setTimeout(retryMissingWebgl, 350)` tras `showWindow` |

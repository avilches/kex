# Workspaces - bugs encontrados y cómo se resolvieron

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
## Bug 4b: geometría de ventana - tamaño se restaura, posición descartada (RESUELTO PARCIALMENTE)

### Estado final

**Tamaño**: se guarda en pixels físicos (`inner_size()`) y se restaura con `set_size(PhysicalSize)`
llamado desde un comando IPC (`restore_window_geometry`) invocado en `main.tsx` antes del `show()`
- equivalente al `on_window_ready` del plugin oficial. Funciona de forma fiable.

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

See [SCRATCHPAD.md](SCRATCHPAD.md) for the current model this bug (and its addenda) converged to.

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

### Addendum: el scratchpad restaurado quedaba sin ningun foco (nueva causa raiz)

Tras el fix de arriba seguia dandose el caso, solo en el restore de arranque, de que un terminal
restaurado con el scratchpad activo mostraba la barra abierta pero **ningun** elemento (ni scratchpad
ni terminal) recibia el foco real. `focusLeaf` y el efecto de foco intentan `s.scratchpadFocus?.()`
en cuanto la sesion nace con `initialScratchpad === "focused"`, pero `ScratchpadBar` solo registra ese
callback en su propio `useEffect` de montaje (ver arriba: "no hace `el.focus()` al montar, solo
registra"). En el arranque, con muchas tabs restaurandose a la vez, el intento de foco (via
`s.ready.then()` tras `document.fonts.ready`, o via el `setTimeout(0)` del efecto de foco) podia
ejecutarse antes de que `ScratchpadBar` llegara a montar y registrar `scratchpadFocus`, dejando el
intento como no-op silencioso y sin ningun reintento posterior.

**Fix**: `src/modules/terminal/lib/pendingFocus.ts` extrae el mecanismo a dos funciones puras
(`tryRequestFocus`, `shouldFireOnRegister`) con test dedicado. Un intento de foco que llega antes del
registro marca `Session.scratchpadFocusPending = true`; `setLeafScratchpadFocus` (llamado por
`ScratchpadBar` al montar) consume ese pending y dispara el foco en cuanto el callback existe, sin
depender de cuantos ticks tarde el mount. Se elimina el `setTimeout(0)` "prueba en el siguiente tick"
de `cycleScratchpad` y del efecto de foco: ya no hace falta adivinar el timing.

### Addendum 2: click en una Tab de otro Pane (split) roba el foco al volver

Con dos o mas Panes visibles (split), un Tab del Pane A con el scratchpad activo pierde el foco (sin
pasarlo a ningun sitio) si el usuario hace click con el raton en un Tab de un Pane B distinto y luego
vuelve a hacer click en el Tab original de A. No ocurre al cambiar de Tab dentro del mismo Pane, ni al
cambiar de Pane con un shortcut de teclado.

**Causa raiz**: el `<div>` de cada Tab en `PaneTabBar.tsx` recibe `tabIndex={0}` via `{...attributes}`
de `useDraggable` (dnd-kit), asi que es un objetivo valido de foco nativo del navegador en `mousedown`.
Secuencia del click cruzado de panes:

1. **mousedown** sobre el Tab de A → `onMouseDownCapture` en `PaneView.tsx` (`handleFocus`) →
   `onFocusPane` → `activePaneId` cambia. En split, `visible` del Tab de A ya era `true` (es el tab
   activo de su propio pane); solo `focused` pasa a `true` aqui, y como AMBOS cambian en el mismo
   commit, el efecto de foco de `useTerminalSession` corre y enfoca correctamente el scratchpad.
2. El navegador aplica la accion por defecto de `mousedown`: como el div tiene `tabIndex=0`, le roba
   el foco DOM al scratchpad y se lo lleva el.
3. **click** (tras mouseup) → `onActivate(tab.id)` → `onActivateTab`. Como ese Tab ya era el
   `activeTabId` de su Pane, `visible`/`focused` no cambian en este segundo commit, asi que el efecto
   de foco de `useTerminalSession` no se re-ejecuta (sus deps no cambiaron) y nadie corrige el robo.

Por que SI funciona en los otros dos casos: en el mismo Pane, `handleFocus` en el mousedown es un
no-op (el Pane ya estaba enfocado), asi que el unico cambio real de `visible`/`focused` ocurre en el
`click` - ahi es donde se enfoca el scratchpad, como ULTIMA accion del gesto completo (despues del
robo nativo del mousedown, que ya paso antes sin nada que robar). Con teclado no hay eventos de raton,
asi que nunca hay robo nativo de foco con el que competir.

**Fix (doble, sin depender de uno solo)**:
- `PaneTabBar.tsx`: `preventDefault()` en el `onMouseDown` del Tab (boton izquierdo) para que el
  navegador nunca robe el foco al div. Ataca la causa raiz directamente.
- `useTerminalSession.ts` exporta `requestLeafFocus(leafId)` (misma logica que
  `SlotAdapter.focusLeaf`); `PaneView.tsx` la llama en `handleActivate` tras `onActivateTab`, para
  reafirmar el foco del leaf incluso cuando `visible`/`focused` no cambiaron y por tanto el efecto no
  se re-ejecuta. Red de seguridad independiente del `preventDefault()`.

Superseded by Addendum 5: the current model is binary (scratchpadOpen only).

### Addendum 3: el modelo de "lado activo pegajoso" (`scratchpadActive`) era la causa real

Tras los dos addendums anteriores el usuario seguia viendo el bug al volver a una Tab con el
scratchpad abierto tras cambiar de Tab/Pane con el raton. La instrumentacion con logs (`console.log`
en cada punto de decision de foco, luego `console.trace` en el setter) revelo la causa real: el JSON
persistido de esa Tab tenia `"scratchpad": "visible"` (abierto, pero NO el lado activo), no
`"focused"`. El campo `scratchpadActive` (`Session.scratchpadActive`, "que lado usaste por ultima
vez, sobrevive al cambio de tab") se ponia a `false` de forma silenciosa y permanente con un simple
click dentro del area del terminal mientras la tab ya tenia el foco (`TerminalPane.tsx`, dos
`onMouseDown`/`onMouseDownCapture`, llamaban a `setLeafScratchpadActive(tabId, false)`). Nada volvia
a ponerlo a `true` salvo clicar directamente el textarea del scratchpad o el shortcut de ciclar
(`Cmd+U`/`cycleScratchpad`) - cambiar de Tab NUNCA lo reactivaba, por diseño ("survives tab blur").
Una vez en `false`, quedaba persistido asi para siempre: cada restore heredaba el mismo valor roto.

Ningun fix de foco (pendingFocus, requestLeafFocus, preventDefault) estaba mal: todos respetaban
`scratchpadActive` correctamente. El problema era el propio modelo de 3 estados
(`hidden | visible | focused`) con una preferencia "pegajosa" separada del simple on/off, facil de
desactivar sin que el usuario se diera cuenta y sin forma obvia de reactivarla con el raton.

**Fix (rediseño, no otro parche)**: se elimina `scratchpadActive` por completo. El modelo pasa a ser
`enabled: boolean` (persistido, `Session.scratchpadOpen` / `Tab.scratchpadEnabled`) +
`visible = enabled && tab.focused` (derivado, nunca persistido). Al recuperar el foco una tab con el
scratchpad `enabled`, el foco SIEMPRE va al scratchpad (nunca "recuerda" el lado usado la ultima vez).
Clicar dentro del terminal mueve el foco alli de forma puramente transitoria (el foco nativo del
click, sin ningun `setLeafScratchpadActive`): en cuanto sales y vuelves a la tab, se resetea al
scratchpad. `cycleScratchpad` (Cmd+U/Esc) decide hacia donde alternar con el campo transitorio ya
existente `scratchpadFocused` (tiene foco DOM ahora mismo), sin escribir ningun estado persistido
nuevo. `ScratchpadState` (`"hidden" | "visible" | "focused"`) y `scratchpadStateOf` desaparecen;
`Tab.scratchpad` se renombra a `Tab.scratchpadEnabled: boolean`.

### Leccion

Cuando una investigacion de foco/timing lleva varias rondas de logs sin encontrar la causa, comprobar
primero el DATO PERSISTIDO real (el JSON en disco) antes de seguir asumiendo una carrera de eventos.
Aqui la causa no era ninguna carrera: era un tercer estado silencioso, dificil de notar y sin via de
vuelta clara, cuyo arreglo correcto fue eliminarlo del modelo en vez de sincronizarlo mejor.

Superseded by Addendum 5: the current model is binary (scratchpadOpen only).

### Addendum 4: xterm.js roba el foco de vuelta de forma asincrona tras un resize

Tras el Addendum 3 el bug de "click en Tab de otro Pane, vuelvo, el SP no gana el foco" seguia
reproduciendose identico (raton falla, teclado funciona). Un listener global de `focusin` en
`document` (capture) con `console.trace()` revelo la causa real: nuestro codigo pone el foco
correctamente en el textarea del scratchpad (confirmado sincronamente, `document.activeElement`
apunta al textarea justo despues de `el.focus()`), pero **uno o dos frames despues**, xterm.js llama
a su propio `.focus()` interno sobre su `textarea` oculta (`xterm-helper-textarea`), robando el foco
de vuelta. El stack trace mostraba la llamada originandose dentro del propio bundle de `@xterm/xterm`
(`CoreBrowserTerminal`), sin ninguna llamada nuestra en medio - no es un bug en nuestro codigo de
foco, es xterm.js reaccionando a algo (muy probablemente su propio `ResizeObserver`: el contenedor
del terminal encoge de alto cuando el `ScratchpadBar` hermano se monta en el mismo flex column,
disparando el recalculo de filas/columnas de xterm).

Por que solo con raton: en el caso de teclado (`focusLeaf` disparado sin ningun evento de raton de
por medio) tambien podria darse la misma carrera en teoria, pero al no haber ningun mousedown/resize
adicional en juego el timing no coincide con la ventana en la que xterm hace su robo; con raton, el
click en la Tab de otro Pane siempre coincide con el resize del terminal que se achica al mostrar
el scratchpad.

**Fix**: en vez de parchear xterm.js (arriesgado, tercero), `useTerminalSession.ts` aplica el mismo
patron que `scheduleUnhide` (`rendererPool.ts`) ya usa para el mismo tipo de problema: diferir con
doble `requestAnimationFrame` (el mismo margen que usa `scheduleUnhide` para dejar que el navegador
se asiente) y revalidar (`s.scratchpadOpen && s.scratchpadFocus === fn`) justo antes de disparar el
foco. Asi nuestra llamada es siempre la ULTIMA en tocar el foco, gane quien gane la carrera interna de
xterm. Esto sustituye el disparo sincrono anterior (`tryRequestFocus` de `pendingFocus.ts`, eliminado
por quedar sin uso) tanto en `requestScratchpadFocus` como en el consumo del pending de
`setLeafScratchpadFocus`.

### Leccion 2

Un `console.log`/`console.trace` en un listener GLOBAL de `focusin` (capture, en `document`) es la
forma mas rapida de encontrar quien roba el foco cuando ya se ha descartado el propio codigo: el
stack trace señala directamente la libreria/lugar exacto, sin tener que teorizar sobre el orden de
efectos de React o de eventos del navegador.

### Addendum 5: modelo binario definitivo (`scratchpadOpen`), sustituye a `enabled` + `scratchpadFocused`

### Sintoma

Aun despues del rediseño del Addendum 3 (que elimino `scratchpadActive` y dejo el modelo en
`enabled: boolean` + `visible = enabled && tab.focused` derivado, con un campo transitorio separado,
`scratchpadFocused`, para "que lado tiene el foco ahora mismo") seguian dandose bugs de "que lado
tiene el foco": cambiar de Tab dentro de la misma pane y volver a la Tab de origen podia resetear el
lado enfocado (terminal o scratchpad) en vez de preservar el que el usuario habia dejado (833024d,
"same-pane tab switch reset scratchpad focus mode instead of preserving it"), y el comportamiento
divergia entre teclado y raton: el atajo de teclado reenfocaba siempre el scratchpad via
`requestLeafFocus` (pensada originalmente para saltos de workspace), mientras el click de raton en la
Tab respetaba el ultimo lado usado.

### Pistas falsas descartadas

- Seguir parcheando el campo transitorio "ultimo lado usado" (`scratchpadFocused`) para que
  sobreviviera correctamente a cada tipo de cambio de foco (misma tab, cross-pane, workspace, teclado,
  raton): cada caso nuevo encontraba una combinacion de eventos que el campo no cubria.
- Unificar `requestLeafFocus` (pensada para saltos de workspace/notificacion) con el camino de "misma
  pane, cambio de tab" en vez de eliminar la distincion: las dos rutas debian coexistir, y cada punto
  de entrada nuevo de foco (bell, RunButton, OpenInEditorButton, `onCloseAutoFocus` de los menus Radix)
  era una ocasion mas de usar la funcion equivocada y reintroducir la divergencia.

### Causa raiz

El modelo de dos campos independientes -- `enabled` (persistido, existencia de la barra) y
`scratchpadFocused` (que lado tiene el foco ahora mismo, con memoria propia) -- tiene mas estados
posibles que interacciones reales necesita la app. La unica pregunta que importa es "¿tiene el usuario
el cursor en el textarea del scratchpad ahora mismo?"; cualquier evento que no actualizara ese segundo
campo de forma exhaustiva dejaba una combinacion sin cubrir, y multiplicar los puntos de entrada de
foco (teclado, raton, bell, dialogs, menus Radix) multiplicaba las oportunidades de que alguno usara
la funcion de foco equivocada o se olvidara de tocar el campo.

### Fix

Se colapsa el modelo a un unico estado binario, `Session.scratchpadOpen`: existencia y foco son la
misma cosa, no hay "abierto sin foco". El cierre pasa a ser explicito y centralizado en vez de
depender de que cada camino de foco mantenga un campo de memoria:
- `onActivateTabStable`, con la funcion pura `scratchpadLeafsToClose`, cierra el scratchpad del tab
  que se abandona (y, en una activacion cross-pane, tambien el de la pane abandonada).
- `leaveActivePaneScratchpad` (via `onFocusPaneStable` / `focusPaneInDirection`) cierra al cambiar de
  pane.
- El efecto de cambio de workspace (`prevWorkspaceIdRef` en `App.tsx`) cierra al cambiar de workspace.
- El blur del textarea (`leaveLeafScratchpad`) cierra en cualquier otro caso, con dos guards: el
  estado `settingsOpen` del menu de ajustes (Radix, portaleado) y un `onMouseDown` con
  `preventDefault` en el marco del contenedor, para que clicar el padding de la barra no cuente como
  "salir".

`requestLeafFocus(leafId)` queda como la unica primitiva "enfoca este leaf" (scratchpad si esta
abierto, si no el slot del terminal); todos los saltos de foco (teclado, raton, notificaciones, bell,
RunButton, OpenInEditorButton, `onCloseAutoFocus` de Radix) pasan por ella, asi que ninguno puede
reintroducir la divergencia porque ya no queda un segundo camino con reglas distintas.

### Leccion

Cuando un bug de foco sobrevive a varios parches sucesivos sobre el mismo campo "de memoria", el
problema casi siempre es el propio campo, no el ultimo evento sin cubrir: fusionar los dos estados en
uno solo (existencia == foco) elimina la clase entera de bug en vez de tapar el siguiente caso.

Leccion de F1 (Tarea 1, `ScratchpadBar.tsx`): los portales de Radix rompen los guards de containment
en `onBlur` porque el contenido del menu vive en `document.body`, fuera de `containerRef`; Radix
ademas hace `preventDefault` en el `pointerdown` del trigger, asi que el trigger nunca llega a recibir
foco DOM real y el `relatedTarget` del blur no sirve para detectarlo. El guard correcto es el estado
`open` del propio menu (`settingsOpen`), no el containment del DOM.

### Addendum 6: el retorno de pane por teclado no reabria el scratchpad con `scratchpadRememberFocus` activo

### Sintoma

Con la preferencia `scratchpadRememberFocus` activa, volver a una pane con el scratchpad marcado
para resume (`scratchpadResume`) reabria el scratchpad al hacerlo por bell, RunButton,
OpenInEditorButton o cierre de un dropdown/dialog/menu Radix, pero no al volver por teclado
(`focusPane`/`focusPaneInDirection`): el foco caia siempre en el terminal, ignorando la marca.

### Pistas falsas descartadas

- Un fantasma de HMR (Vite recargando el modulo y dejando una instancia vieja de la sesion sin la
  marca de resume): descartado con un `pnpm tauri dev` fresco tras matar el proceso; el bug era real,
  no un artefacto de la sesion de dev.

### Causa raiz

El efecto de transicion de foco en `useTerminalSession.ts` (~linea 1174, el que reacciona a
`focused` pasando a `true`) es el camino real que mueve el foco DOM en un cambio de pane por
teclado, porque `focusPane` solo actualiza estado de React. Ese efecto es anterior a la marca de
resume y tenia su propia rama inline de dos vias (`scratchpadOpen ? requestScratchpadFocus(s) :
focusSlot(leafId)`), que nunca consultaba `scratchpadResume`. Era un cuarto camino de foco que
bypaseaba `requestLeafFocus`, la primitiva unica establecida en el Addendum 5 precisamente para que
ningun punto de entrada de foco pudiera reintroducir esta clase de divergencia.

### Fix

La transicion ahora delega en `requestLeafFocus(leafId)`, que ya implementa las tres vias
correctas (scratchpad abierto -> foco al scratchpad; scratchpad cerrado con marca de resume viva y
preferencia activa -> reabrir vía `openScratchpadState` y consumir la marca; si no, foco al
terminal). El guard `gained && !blocks` se mantiene igual, solo cambia que hace dentro.

### Leccion

"`requestLeafFocus` es la unica primitiva de foco" es un invariante que hay que hacer cumplir en
CADA sitio que enfoca un leaf, incluidos efectos internos del propio modulo del terminal, no solo en
los puntos de entrada obvios (bell, RunButton, menus). Un efecto interno que predata una feature
nueva puede quedar con su propia logica inline y bifurcar la semantica silenciosamente por
dispositivo de entrada (raton/teclado vs otros caminos) sin que ningun test end-to-end lo note si
solo cubre un dispositivo.

## Bug 8: la navegacion por teclado entre workspaces no sigue el orden visual (RESUELTO)

### Sintoma

Tras introducir los grupos de status (y permitir colapsarlos), `workspace.next`/`workspace.prev`
(hoy `nav.next`/`nav.prev`, que ademas recorren los tabs con `lib/linearNav.ts`)
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

## Bug 9: el header no muestra el mensaje en vivo del agente, solo "claude" (RESUELTO)

### Sintoma

Con un agente corriendo en un tab, la segunda linea del header (`WorkspaceTitle.tsx`, bajo el
titulo del workspace) mostraba solo el nombre del agente ("claude"). La barra de tabs
(`PaneTabBar.tsx`), en el mismo tab, si mostraba el mensaje/estado real que el agente comunica.

### Pistas falsas investigadas (para no repetirlas)

1. **`AgentSignal.message`**: el protocolo de hooks de Claude Code
   (`ipc.rs`, evento `kex:agent-signal`) trae un campo `message` en eventos
   `Notification`/`Stop`/`StopFailure`. Se investigo a fondo pensando que era la fuente del texto
   que faltaba en el header. **No lo es**: ese `message` se usa solo para el toast puntual
   (`route.ts` -> `showAgentToast`) y nunca se persiste; no es la fuente del texto que si se ve en
   el tab.
2. **El toast de Sonner ("el tab ya lo tiene")**: se penso que el tab reusaba algun estado
   persistido con el mensaje. Tampoco: el toast es efimero, su `body` es un parametro de funcion
   que desaparece en cuanto se cierra. No existia ningun campo `body`/`message` en
   `AgentNotification` (`src/modules/agents/lib/types.ts`).
3. **`agentSession.meta.sessionTitle`**: se penso en mover el "titulo en vivo" a este campo,
   estructurado en el store del agente. Tampoco es la fuente correcta: `sessionTitle` llega **una
   sola vez**, en el hook `SessionStart` de Claude Code (`ipc.rs`), y con frecuencia viene vacio.
   No se actualiza mientras el agente trabaja.

### Causa raiz real

El titulo en vivo real viaja por un cuarto canal, ya existente y sin relacion con los tres
anteriores: la secuencia **estandar** de titulo de ventana de terminal (OSC 0/2), que Claude Code
actualiza continuamente mientras trabaja (con un glifo de estado delante, tipo `✳`/`⏺`). Vive en
`oscTitleStore` (`src/modules/terminal/lib/oscTitleStore.ts`), poblado por el parser generico de
OSC del terminal, ajeno a los agentes.

`PaneTabBar.tsx` ya tenia una funcion `agentTitle` que, cuando hay agente, salta el
`runningCommand` y usa `oscTitle` directamente. `WorkspaceTitle.tsx` en cambio calculaba el
subtitulo con la funcion generica `tabTitle(tab, runningCommand, oscTitle)`, cuya prioridad para
tabs terminal es `tab.title -> runningCommand -> oscTitle`. Con un agente activo, el shell reporta
via OSC 133 que el comando en ejecucion es literalmente `claude ...`, asi que `runningCommand`
ganaba siempre y el header se quedaba con `basename("claude")` = `"claude"`.

### Fix

1. `agentAwareTabTitle()` (`src/modules/workspaces/lib/tabTitle.tsx`): funcion pura con la
   prioridad correcta para tabs con agente: `tab.title -> oscTitle -> sessionTitle -> "agente ·
   directorio"`. `sessionTitle` (`agentSession.meta.sessionTitle`) actua solo como relleno inicial
   mientras no ha llegado el primer `oscTitle`.
2. `useAgentTabTitle(tab)` (`src/modules/workspaces/lib/useAgentTabTitle.ts`): hook que centraliza
   las suscripciones (`terminalEphemeralStore`, `oscTitleStore`, `agentStore`) y aplica
   `agentAwareTabTitle()`. Tanto `PaneTabBar.tsx` como `WorkspaceTitle.tsx` lo consumen, asi que no
   pueden volver a divergir.

### Leccion

Cuando un dato "en vivo" de un agente parece faltar en un sitio pero sobra en otro, comparar primero
como lo obtiene el sitio que **si** funciona antes de asumir que hace falta un canal de datos nuevo
(nuevo campo en un store, nuevo evento IPC). Aqui el dato ya existia y ya estaba persistido
(`oscTitleStore`); el bug era de prioridad de fuentes en un componente, no de falta de plumbing.

## Bug 10: cambiar de pestana entre terminales seguia lento tras aparcar en vez de liberar (RESUELTO)

### Sintoma

Tras anadir el presupuesto de memoria para terminales aparcados (ver el propio TASK-761: mantener
vivos el terminal y su buffer al ocultar una pestana, soltando solo el contexto WebGL), el usuario
seguia notando el mismo parón al alternar entre pestanas de terminal, sobre todo con muchas sesiones
de agente abiertas a la vez. Entre pestanas de editor iba rapido; solo entre terminales dolia.

### Pistas falsas descartadas

- Recrear el contexto WebGL al volver a mostrar la pestana (`attachWebgl`): medido en 4-9ms,
  insignificante.
- El tamano del historial de scroll (`bufferLines`): medido identico con 68 y con 2068 lineas de
  buffer, mismo coste. No es proporcional al scrollback.
- Perder el contexto WebGL en si (`WEBGL_lose_context`/`loseContext()`): medido en 0.0ms siempre.

### Causa raiz

`disposeSlotWebgl` (llamada por `parkLeafSlot` en cada ocultacion) llama a `addon.dispose()`, el
metodo propio de `WebglAddon` de `@xterm/addon-webgl`. Ese `dispose()` registra un disposable que
llama incondicionalmente a `renderService.setRenderer(core._createRenderer())` +
`renderService.handleResize(...)`: reconstruye un `DomRenderer` completo (el renderer DOM de
reserva de xterm, documentado en su propio codigo como "not meant to be particularly fast"). Su
constructor crea un elemento DOM por cada fila *visible* del terminal, un `WidthCache` con sus
propios elementos auxiliares, e inyecta una hoja de estilos nueva - coste fijo proporcional a
`term.rows`, no al historial, medido en 50-65ms consistentes. Ese `DomRenderer` nunca llega a
pintar nada: en cuanto la pestana vuelve a ser visible, `attachWebgl` crea un contexto nuevo y lo
descarta sin usarlo. Confirmado leyendo el codigo fuente instalado de `@xterm/addon-webgl@0.19.0`
(la version estable que usa Kex) y comparado con la beta mas reciente publicada en npm en el
momento de la investigacion (`0.20.0-beta.300`, descargada del tarball del registro): identico en
ambas, no es un bug con parche pendiente en una version mas nueva.

### Fix

`parkLeafSlot` ya no llama a `disposeSlotWebgl` de forma sincrona: llama a `scheduleWebglReap`, el
mismo mecanismo de margen de gracia (`WEBGL_REAP_GRACE_MS = 30s`) que ya usaba `detachSlotFromLeaf`
para slots totalmente libres. `refreshLeafSlot` (la pestana aparcada vuelve a ser visible) llama a
`cancelWebglReap` antes de nada, asi que un cambio de pestana rapido nunca llega a pagar el coste de
reconstruir el `DomRenderer`: solo lo paga una pestana que se queda de verdad oculta el margen
completo. El guardian del propio temporizador (`if (slot.currentLeafId === null) disposeSlotWebgl`)
se elimino: como todo camino que reclama el slot antes de que salte el timer lo cancela primero (
`bindSlot`/`rewireSlot` para un slot idle recuperado, `refreshLeafSlot` para uno aparcado), si el
timer llega a disparar es siempre seguro destruir el contexto, aparcado o no. El filtro de eviccion
de `attachWebgl` bajo presion de `WEBGL_MAX_CONTEXTS` paso de mirar solo `currentLeafId === null` a
mirar `webglReapTimer !== null`: un slot aparcado en tiempo de gracia es tan buen candidato a perder
su contexto bajo presion como uno totalmente libre.

### Leccion

Un arreglo de rendimiento que solo mueve el coste de sitio (de "reescribir el snapshot" a "llamar a
`dispose()` de un addon de terceros") puede reproducir el mismo sintoma por una via completamente
distinta si no se mide el propio addon. Medir con `performance.now()` en cada frontera de la funcion
sospechosa, no solo en la propia, encontro que el coste no estaba ni en nuestro codigo de aparcado
ni en la perdida del contexto del navegador, sino en un efecto colateral documentado (pero facil de
pasar por alto) de una libreria de terceros.

---

## Bug 11: el menu de tres puntos del editor no aparecia al abrir un .md por primera vez (RESUELTO)

### Sintoma

Al arreglar que el boton de tres puntos (ajustes de vista del editor, en `EditorPathBar`) dejara de
desmontarse al entrar en preview/split, el usuario seguia sin verlo la primera vez que abria un
`.md`: aparecia el ojo y el boton de panel dividido, ya en modo preview, pero no el de tres puntos.
En cuanto pulsaba cualquiera de los dos botones, el de tres puntos aparecia y ya no volvia a
desaparecer nunca, se hiciera lo que se hiciera despues.

### Pistas falsas descartadas

- Vite HMR mostrando un render antiguo de una pestana ya montada antes del cambio (patron ya
  documentado en `CLAUDE.md`): descartado porque el usuario reprodujo el fallo tras matar el proceso
  y arrancar `pnpm tauri dev` en frio.
- Un problema de timing en el primer render (settings aun no hidratados, viewToggles llegando
  `undefined` un instante): descartado con una traza (`console.log` temporal en `EditorPathBar`) que
  mostro `showToggles: false` de forma estable, no solo en el primer tick.

### Causa raiz

Abrir un `.md` desde el explorador crea una pestana `kind: "markdown"`, no `kind: "editor"`. Ese tipo
de pestana tiene tres motores de render distintos segun `markdownEngine` (`tiptap`, `milkdown`,
"legacy"): el legacy es el que se activa por defecto en este repo y monta su **propio** `EditorPathBar`
directamente en `TabContent.tsx` (rama `case "markdown"`, la que no usa `MarkdownTab.tsx`), con un
`view={{ mode: "overlay", ... }}` fijo pero sin pasar nunca `viewToggles` ni `globalToggles`. El
arreglo anterior solo habia tocado la rama `case "editor"`, que es donde aterriza la pestana **tras**
pulsar el ojo o el panel dividido (`onSetMarkdownView`/`onUpdateTab` convierten la pestana de
`markdown` a `editor`), asi que a partir de ese clic ya usaba el `viewToggles` siempre montado. La
pestana legacy en si nunca lo tuvo.

### Fix

`buildViewToggles(path)` en `TabContent.tsx` concentra el calculo (antes vivia solo dentro del `case
"editor"`) y se llama desde las dos ramas que montan un `EditorPathBar` para un archivo markdown: el
`case "editor"` y el render legacy de `case "markdown"`. Como `effectivePreviewMode` ya vale
`"overlay"` fijo para cualquier pestana `kind: "markdown"`, el mismo helper deja el boton disabled
ahi automaticamente, sin condicion extra.

### Leccion

Un tab `kind` puede tener mas de un componente que monta la misma barra compartida (`EditorPathBar`)
de forma independiente; arreglar la version mas obvia (la que ya usa el usuario tras un clic) no
implica haber cubierto la que se ve **antes** de ese clic. Antes de dar un fix de una barra compartida
por completo, `grep -rn "<EditorPathBar"` para listar todos los que la montan, no solo el que
disparo el reporte original.

---

## Bug 12: crear un segundo grupo del WorkspaceBar borraba el grupo recien creado (RESUELTO)

### Sintoma

Al introducir los grupos de workspace por ventana (TASK-768, sustituyendo el antiguo "status"
global), crear un grupo nuevo desde "Move to Group" -> "New" funcionaba la primera vez: se podia
escribir el nombre. Pero al crear un SEGUNDO grupo nuevo (sobre un workspace que ya pertenecia a
otro grupo), el grupo recien creado desaparecia de la barra en cuanto se confirmaba, dejando el
workspace suelto en la seccion "sin grupo", y ningun intento posterior de "New" volvia a funcionar.

### Pistas falsas descartadas

- Un bug de foco/Popover en `SortableGroupHeader` (el mismo patron que ya usa el rename de
  workspace, calcado sin cambios de logica): descartado porque el nombre SI llega a escribirse y
  persistirse (`onRenameGroup` se ejecuta), solo el grupo desaparece despues.
- Colision de IDs de `newGroupId()`: descartado, 6 bytes de `crypto.getRandomValues` por grupo, sin
  reutilizacion posible en una sesion.
- Un problema del `SortableContext` exterior anadido para poder arrastrar cabeceras de grupo:
  descartado tras revisar que `useSortable` resuelve siempre al `SortableContext` mas cercano, y los
  items de un grupo siguen anidados en su propio contexto interior, sin tocar el exterior.

### Causa raiz

`handleSetGroup` (en `App.tsx`) leia `workspaces` - el array de React, capturado por el closure del
`useCallback` - para decidir si el grupo de origen del workspace se habia quedado vacio y debia
podarse. Pero `setWorkspaceGroup(workspaceId, groupId)` solo *programa* la actualizacion: el array
`workspaces` que ve el resto de la misma funcion, en el mismo evento sincrono, sigue siendo el de
ANTES del cambio (React no aplica el nuevo estado hasta el siguiente render). Para un workspace que
aun no tenia grupo, `prevGroupId` era `null` y una guarda evitaba podar nada - de ahi que la
PRIMERA creacion funcionara siempre. Pero al mover un workspace YA agrupado a un grupo nuevo,
`pruneEmptyGroups` se ejecutaba sobre ese array desactualizado: el grupo de origen seguia
"pareciendo usado" (el workspace aun no habia salido de el, segun ese snapshot) asi que NO se
podaba, mientras que el grupo nuevo no aparecia usado por nadie (el snapshot no sabe que el
workspace acaba de entrar en el) asi que SI se podaba, borrando exactamente el grupo que se
acababa de crear. Reproducido de forma determinista con un script que simula la secuencia exacta de
`handleCreateGroup` -> `handleSetGroup` -> poda usando solo las funciones puras, sin necesidad de
arrancar la app.

### Fix

Nueva funcion pura `reconcileGroupsAfterMove(groups, workspacesBeforeMove, workspaceId, nextGroupId)`
en `workspaceOrder.ts`: en vez de que el llamador intente adivinar o esperar a que `workspaces` ya
refleje el movimiento, la propia funcion aplica el movimiento sobre la copia que recibe (`.map` puro,
sin depender de ningun estado de React) y solo despues llama a `pruneEmptyGroups` sobre ese
resultado. `handleSetGroup` le pasa el `workspaces` capturado tal cual, ANTES de aplicar nada, y la
funcion se encarga de calcular el "despues" ella misma - asi ya no importa en que momento del ciclo
de React se lea el closure, porque nunca se confia en que ya se haya actualizado. `handleCommitGroupMove`
(el que se dispara al soltar un drag) no necesito este mismo tratamiento: para cuando el drag
termina, los cambios de grupo en vivo (`handlePreviewGroup`, durante el `dragOver`) ya se aplicaron
en renders previos y separados en el tiempo, asi que ahi `workspaces` si esta al dia.

### Leccion

Cuando un handler necesita decidir algo basandose en "el estado tal y como quedara" justo despues de
programar un cambio con un setter de React, no leer el estado de React para eso: calcular el
resultado con una funcion pura que reciba el estado ANTERIOR explicito y aplique el cambio ella
misma. Cualquier atajo que asuma "total, para cuando se ejecute esta linea ya se habra aplicado" es
una apuesta sobre el orden de re-render de React, no un hecho garantizado en el mismo evento
sincrono. El primer intento de una feature que solo se prueba con el caso mas simple (un workspace
sin grupo previo) puede ocultar durante un rato un bug que solo aparece al repetir la accion sobre
estado ya no-trivial.

---

## Bug 13: arrastrar la cabecera de un grupo para reordenar hacia un "swap" raro (RESUELTO)

### Sintoma

Arrastrar la cabecera de un grupo del WorkspaceBar para reordenarlo respecto a otro grupo (TASK-768)
producia un reordenamiento que parecia intercambiar posiciones de forma brusca en vez de deslizar
los grupos de por medio, sobre todo notorio cuando los grupos involucrados tenian un numero muy
distinto de workspaces dentro.

### Causa raiz

`useSortable` se llamaba dentro de `SortableGroupHeader`, y su `setNodeRef` solo se aplicaba al
`<button>` de la cabecera, no al bloque completo del grupo (cabecera + su lista variable de
workspaces). dnd-kit mide el nodo que recibe `setNodeRef` para calcular, con la estrategia
`verticalListSortingStrategy`, cuanto debe desplazarse cada elemento durante el arrastre. Al medir
solo la cabecera (una altura fija y pequeña, igual para todos los grupos) pero reordenar en realidad
bloques de altura muy distinta (cabecera mas N workspaces), los calculos de desplazamiento no
correspondian con el tamano real de lo que se movia en el DOM, y el resultado visual parecia un
intercambio en vez de un deslizamiento proporcional.

### Fix

Patron oficial de dnd-kit para "drag handles": `useSortable` se llama una unica vez en un nuevo
componente contenedor, `SortableGroupBlock`, cuyo `setNodeRef`/`style` se aplican al `<div>` que
envuelve la cabecera Y los workspaces del grupo (el bloque completo, con su altura real). Los
`attributes`/`listeners` que activan el arrastre se pasan hacia abajo como props a
`SortableGroupHeader`, que los aplica solo a su `<button>`: asi el punto de agarre sigue siendo
unicamente la cabecera, pero lo que dnd-kit mide y anima es el bloque entero.

### Leccion

En una lista de dnd-kit con elementos de tamano variable, el nodo que recibe `setNodeRef` de
`useSortable` debe ser el que ocupa el espacio real que se reordena, no un "handle" visual mas
pequeno dentro de el. Cuando se quiere restringir el arrastre a una zona concreta (un icono, una
cabecera) sin que el nodo medido sea esa misma zona, hay que separar `setNodeRef` (en el contenedor)
de `attributes`/`listeners` (en el handle), llamando a `useSortable` una sola vez en el nivel que
tiene acceso a ambos.

## Bug 14: el comando de resume de la primera pestana al arrancar nunca se ejecutaba (RESUELTO)

### Sintoma

Al reabrir Kex con varias pestanas de Claude, siempre la misma (la primera por orden, PTY id=1) quedaba con un shell vacio: el plan de restore se calculaba bien (`Kex.log`: `restore plan: tab=... cmd="claude --resume '...'"`), el PTY se abria en el cwd correcto, pero no aparecia ningun `osc133 C: armed ... cmd= claude --resume ...` para ella, mientras las demas pestanas si lo mostraban 2-3 s despues de abrirse.

### Pistas falsas descartadas

- "Restore Command" desactivado: `restoreOnRestart` era `true` en el JSON del workspace, y con el flag apagado el PTY no se habria abierto en el cwd del plan.
- Sobrescritura de la sesion: el `session_id` de `agent-sessions.json` era el mismo antes y despues; el usuario lanzo `claude -c` a mano y este continuo justo esa conversacion.
- Carrera de plan no cargado: los planes se sirven todos en una sola llamada IPC y `attachSession` espera a `restorePlansReady()`.

### Causa raiz

`attachSession` escribia el comando con un `setTimeout` ciego de 200 ms tras abrir el PTY, suponiendo que el shell ya leia stdin. La pestana activa es la unica que hace antes, de forma sincrona, `bindLeafToSlot` (creacion del contexto WebGL, en pleno arranque en frio de la GPU), y ademas se abren ~8 shells a la vez, asi que 200 ms no garantiza nada y el texto se perdia sin dejar rastro. No se pudo aislar el mecanismo exacto de la perdida, pero un delay fijo no puede ser fiable.

### Fix

Rust detecta el primer `OSC 133;B` de cada PTY (`Transition::ShellReady`) y emite `kex:shell-ready { id }`. `writeWhenShellReady` (`useTerminalSession.ts`) espera a ese evento (`shellReadyWaiter.ts`, con un listener global registrado al cargar el modulo y un `seen` para eventos que llegan antes de esperar) y con un fallback de 1500 ms. Se usa `133;B` y no `133;A` porque `zshrc.zsh`/`bashrc.bash` llaman a `_kex_precmd` a mano mientras aun se hace `source` del rc, asi que `A` sale antes de que el shell acepte input; `B` va dentro de `PS1` y solo sale al pintarse el prompt real.

### Leccion

Un `setTimeout` para "esperar a que el shell este listo" es una apuesta de timing; si el sistema ya emite una senal real de prompt listo, esperar a esa senal. Y ante un fallo que siempre cae en el mismo elemento del arranque, buscar que trabajo extra hace solo ese elemento antes de culpar a la carga general.

## Bug 15: la pestana de una instancia de Kex se quedaba con el spinner del agente para siempre (RESUELTO)

### Sintoma

Con la Kex instalada y `pnpm tauri dev` abiertas a la vez, una pestana con Claude Code terminaba su turno pero el spinner del agente no se apagaba nunca. El agente seguia vivo y respondia, y los eventos de hook (`Stop`, etc.) aparecian en el spool de la pestana, pero la interfaz no los recibia.

### Pistas falsas descartadas

- Que el agente no emitiera `Stop`: el hook se ejecutaba y el evento estaba en el spool.
- Un fallo del spool: tenia los eventos correctos; simplemente nadie escuchaba el socket.

### Causa raiz

El socket de hooks se llamaba `kex-ipc-<pty_id>.sock` y vive en un directorio por usuario compartido por todas las instancias de Kex. Cada instancia numera sus PTYs desde 1, asi que chocaban (en los logs, la instalada tenia id=38 y Kex Dev abrio id=38 un minuto despues). `spawn_listener` hacia `remove_file` y `bind`, robando el socket vivo de la otra instancia, y `IpcGuard::drop` borraba el fichero por ruta, de modo que cerrar una pestana de una instancia podia borrar el socket de la otra.

### Fix

El nombre pasa a `kex-ipc-<pid>-<pty_id>.sock`, con el pid del proceso de Kex, de forma que dos instancias vivas nunca comparten ruta. La primera vez que se construye una ruta se borran los `kex-ipc-<pid>-*.sock` cuyo pid ya no existe (`kill(pid, 0)` con ESRCH); los de pids vivos y los ficheros que no encajan en el patron no se tocan (`orphaned_sockets`, funcion pura con tests). Los sockets del formato antiguo `kex-ipc-<n>.sock` que ya hubiera en disco no se barren (no hay migracion); se borran a mano con `rm $TMPDIR/kex-ipc-$(id -u)/kex-ipc-[0-9]*.sock`.

Desde TASK-736 hay un solo socket por proceso, `kex-ipc-<pid>.sock`, y no uno por PTY; el pid en el nombre sigue siendo lo que separa las instancias, y el barrido de pids muertos es el mismo. Los `kex-ipc-<pid>-<pty_id>.sock` que deje una version anterior no encajan en el patron nuevo y no se barren.

### Leccion

Un recurso con nombre derivado de un contador por proceso no es unico en una ruta compartida entre procesos. Si varias instancias de la app pueden convivir (instalada y dev), el nombre debe incluir algo propio del proceso, y borrar por ruta solo es seguro si esa ruta no la puede usar nadie mas.

## Bug 16: con dos ventanas, una borraba las sesiones de Claude de la otra (RESUELTO)

### Sintoma

Tras abrir una segunda ventana (la "pequena", con 0 o 1 workspaces) y reiniciar Kex, los workspaces de la ventana principal (Serverless, y parte de kex) arrancaban con shells normales: ninguna tab con Claude se reanudaba, sin ningun error en el log.

### Pistas falsas descartadas

- Un fallo de `claude --resume` o de la transcripcion: no se llegaba a lanzar, porque no habia plan.
- Un fallo del pty o del cwd: los pty abrieron bien y el unico aviso de cwd era de otro workspace (Taxes).
- El log de un arranque en el que el usuario habia cerrado y reabierto tabs a mano contaminaba la lectura del workspace kex; el workspace Serverless, que no se toco, dio la prueba limpia.

### Causa raiz

`agent_session_restore_plan` devuelve el plan de TODAS las sesiones del almacen a cada ventana. Despues `pruneOrphanedPlans` (frontend) trataba como huerfano cualquier plan cuya tab no estuviera en ESA ventana y llamaba a `agent_detach_session`, que borra la entrada de `agent-sessions.json`. Una ventana vacia (a las 17:03 UTC, `create_app_window ... workspaces=0`) desvinculaba siete tabs de la principal. Esas tabs seguian con Claude vivo pero no volvian a registrarse hasta el siguiente `SessionStart`, asi que en el arranque siguiente no habia nada que restaurar. Una ventana no puede distinguir "esta tab es de otra ventana" de "esta tab ya no existe".

### Fix

La decision pasa a Rust y usa la union de todas las ventanas. `WindowStateManager::terminal_tab_ids` recorre los workspaces de cada ventana y devuelve los ids de tabs de tipo terminal; `session_store::split_orphans` separa los planes cuya tab esta en esa union de los que no; `agent_session_restore_plan` desvincula solo los segundos y devuelve el resto. Se elimina `pruneOrphanedPlans` del frontend y sus helpers.

### Leccion

Una limpieza basada en "lo que no veo" solo es segura si quien la hace ve todo el universo. Con estado repartido entre varias ventanas, la decision de borrar tiene que tomarla quien conoce la union, no cada ventana con su trozo.

## Bug 17: un fichero borrado al cerrar el vault no reaparecia en el tab al desbloquearlo (RESUELTO)

### Sintoma

Con un tab abierto sobre `~/Hub/Data/...` (symlink a un montaje de Cryptomator), cerrar el vault dejaba el tab en "This file was deleted from disk". Al desbloquear el vault el fichero volvia a existir pero el tab seguia en ese estado.

### Pistas falsas descartadas

- La logica de `useDocument`: salir de `deleted` cuando el fichero vuelve ya estaba arreglado (commit `66be26c7`) y sus tests pasaban.
- El cableado de `useEditorFileSync` y `MarkdownTab`: llaman a `reload()` en cada `fs:changed` de la carpeta del fichero.

### Causa raiz

Dos fallos encadenados, medidos con un programa aparte sobre `notify` 8.2.0 (FSEvents):

1. El watcher emite rutas canonicas (el destino del symlink) y `useEditorFileSync` y `MarkdownTab` las comparan con la ruta del tab tal como se abrio. Escribir en `link/f.md` produce un evento `real/f.md`. Para cualquier fichero bajo `~/Hub/Data` el evento no coincidia nunca, ni al editarlo desde fuera ni al reaparecer.
2. Montar un volumen no genera ningun evento dentro de las carpetas vigiladas, asi que ni con la ruta bien habria llegado un `fs:changed` al desbloquear el vault.

Descartado: que el watcher quede apuntando al montaje anterior. Con un volumen desmontado y vuelto a montar en la misma ruta, el mismo watcher siguio recibiendo eventos (2 antes, 2 despues).

### Fix

`useDocument` vuelve a comprobar que el fichero existe (`fs_stat`) mientras el estado es `deleted`, y llama a `reload()` si existe. Se dispara al volver el foco a la ventana, al hacerse visible el tab (`visible` desde `TabContent`) y desde el boton "Refresh" de la pantalla de fichero borrado (`refresh()`). No hay temporizador: un sondeo habria corrido en segundo plano para siempre mientras el tab siguiera borrado.

Para el fallo 1, `fs_watch` guarda por directorio canonico las rutas con que se pidio (`Aliases`, con contador por ruta) y `drain_loop` anade a cada evento la misma ruta reescrita con cada una de ellas, sin quitar la canonica. Afecta a todos los consumidores de `fs:changed` (explorer, notas, source control).

### Leccion

Un estado que solo se abandona por un evento del sistema de ficheros necesita una salida que no dependa del evento cuando el origen puede ser un montaje o desmontaje.

## Bug 18: el explorer de `/tmp` no se actualizaba y la tab reabria en `/private/tmp` (RESUELTO)

### Sintoma

Con el explorer en `/tmp` (que es un symlink a `/private/tmp`), un `mkdir` o `touch` desde el terminal no aparecia ni en el nodo `/tmp` ni en el `/private/tmp`. Ademas, al cerrar y reabrir la tab, su cwd era `/private/tmp` en vez de `/tmp`.

### Pistas falsas descartadas

El alias de rutas del Bug 17 parecia cubrirlo, pero fallaba tambien el nodo `/private/tmp`, que ya llevaba la ruta canonica: el problema no era el nombre de la ruta.

### Causa raiz

1. `fs_watch_add` descartaba en silencio cualquier carpeta fuera de las raices autorizadas (home, directorio de lanzamiento y cwd con que se abrio cada PTY). Un `cd /tmp` hecho a mano no autoriza nada, y `fs_read_dir` no comprueba autorizacion, asi que el explorer mostraba la carpeta pero nunca la vigilaba.
2. El PTY se lanza con `chdir("/tmp")`, y `getcwd()` devuelve `/private/tmp`. Como `$PWD` heredado no coincidia, zsh arrancaba con `/private/tmp` y el OSC 7 reportaba esa ruta.

### Fix

`prepare_add` ya no consulta el registro de autorizacion (leer ya estaba sin guardia). `apply_common` fija `PWD` al cwd tal como se pidio, en Unix.

### Leccion

Un watcher que falla en silencio parece un evento perdido. Si una carpeta se lista pero no se refresca, comprobar primero que `fs_watch_add` la acepta.

## Bug 19: el restore de un agente reintentado desde el menu restauraba como `cd --resume` (RESUELTO)

### Sintoma

Un tab con el directorio de lanzamiento borrado quedo bloqueado en el restore. Tras recrear la carpeta y reintentar desde el menu contextual, `claude --resume` funciono. Pero al hibernar y restaurar de nuevo, el tab ejecutaba `cd --resume '<id>'`.

### Pistas falsas descartadas

- Que el restore de arranque estuviera mal montando el comando: no, esa ruta lanza el agente con el cwd ya fijado y sin `cd` delante, y funciona.
- Leer el argv del proceso en memoria en vez de la linea de la shell. Se midio con 22 formas de lanzar en una zsh real: el proceso final NO conserva el nombre del lanzador. `claude-max` termina en `exec claude`, asi que el proceso es un `claude` normal, y su entorno ya viene limpio de `ANTHROPIC_BASE_URL`. Repetir ese argv restauraria contra la pasarela en vez de contra el plan Max, sin avisar.
- Que bash pudiera aportar el texto: su marcador `PS0` emite `OSC 133;C` vacio, asi que en bash no hay `launch_cmd`.

### Causa raiz

Cadena de tres fallos:

1. El reintento escribe en la shell ` cd '<dir>' && claude --resume '<id>'` (`restoreCommandLine`).
2. `match_agent` buscaba el agente en CUALQUIER token de la linea, y `OSC 133;C` llega con la linea tal como se tecleo. La armaba entera y `session_store` guardaba la linea completa como `launch_cmd`.
3. `strip_for_resume_base` daba por hecho que el primer token era el binario. Se quedaba con `cd`, descartaba el resto (no estaba en la lista blanca) y anadia ` --resume '<id>'`.

El mismo defecto hacia que `cd ~/claude-docs` armara el detector, porque el nombre base `claude-docs` empieza por `claude-`.

### Fix

`agent/launch_cmd.rs` (modulo puro con tests) trocea la linea en segmentos respetando comillas, `$(...)`, `&&`, `||`, `;`, `|`, `&`, saltos de linea y parentesis, y se queda con el ultimo segmento cuya palabra de orden es el agente, conservando asignaciones y envoltorios (`env`, `time`, `sudo -u x`, `timeout 5`...). El detector guarda solo ese segmento y `strip_for_resume_base(cmd, agent)` lo vuelve a extraer al leer, y como siempre vuelve a extraer el segmento al leer, un registro que ya se guardo con el prefijo `cd` se corrige solo; no hay codigo de migracion aparte. Lo que no se puede resolver con certeza no se adivina: una opcion de envoltorio desconocida, `pnpm dlx claude` o un entrecomillado que depende de la shell (`'it\'s'`) no dan match y el restore usa el comando por defecto del agente; una linea cortada (256 caracteres o una comilla sin cerrar) sigue armando el detector pero no guarda el texto.

### Leccion

Un texto que llega de la shell es la linea que escribio el usuario, no un comando. Antes de interpretarlo hay que localizar el comando dentro de ella. Y cuando no se puede localizar con certeza, es mejor no detectar que guardar algo que luego se ejecutara tal cual.

## Bug 20: al despertar un workspace, el tab del agente perdia su nombre hasta que el agente arrancaba (RESUELTO)

### Sintoma

Hibernado, el placeholder de `HibernatedTab` (entonces el overlay del workspace) muestra bien el nombre que el agente envio por OSC. Al pulsar Restore, la barra de tabs vuelve a mostrar el titulo generico (la carpeta, o `claude --resume ...` en cuanto se teclea el comando) durante los segundos que tarda Claude Code en arrancar, y solo entonces aparece el nombre bueno.

### Pistas falsas descartadas

- Que el nombre no estuviera persistido: si lo esta, como `Tab.agentTitle` en el JSON del workspace, actualizado en memoria por `agentTitleSync` (ventana compartida de 10 s, flush al hibernar y al cerrar). El placeholder lo lee y por eso hibernado se ve bien.
- Que hiciera falta que el evento de OSC escribiese el dato del tab en memoria: ya lo hace ese sync. El problema no era de escritura sino de lectura.
- Que la sesion del agente rellenara el hueco: se cerro con `finishAgent` al hibernar y no vuelve hasta que el agente restaurado registra su SessionStart.

### Causa raiz

El camino de titulo de un tab despierto (`resolveAgentTabTitle` en `useAgentTabTitle.ts` -> `tabTitle`) solo consulta fuentes en vivo: `oscTitleStore`, `terminalEphemeralStore` y `agentStore`. Al hibernar, el dispose del PTY llama `clearOscTitle`, asi que en la ventana entre el wake y el primer OSC del agente restaurado las tres estan vacias, y `Tab.agentTitle` no participaba en ese camino: solo lo usaba el overlay dormido.

### Fix

`resolveAgentTabTitle` usa como OSC `oscTitle ?? tab.agentTitle` (solo tabs de terminal), y lo cuenta tambien para `isDescription`. El OSC en vivo siempre gana; el dato persistido solo rellena el hueco. El mismo hueco existe en el restore de arranque de la app, y el fix lo cubre tambien.

### Leccion

Un dato que ya vive persistido en el tab no hace falta inventarlo ni esperar a la fuente en vivo: si un componente (el overlay) lo muestra bien y otro (la barra despierta) no, comparar las cadenas de prioridad de los dos antes de tocar el plumbing. El bug era de prioridad de fuentes en el camino de lectura, no de falta de persistencia.

---

## Bug 21: la sticky note del tab activo nunca aparecia al arrancar la app (RESUELTO)

### Sintoma

Al arrancar la app, la nota flotante de un tab que quedo abierta (`noteOpen: true` persistido, icono de nota encendido en el tab) no se muestra. Ocultarla y volver a abrirla (dos veces el atajo o el icono del tab) la hace aparecer. El texto nunca se pierde.

### Pistas falsas descartadas

- Persistencia: Rust guarda el workspace como JSON opaco y el estado en disco llevaba `noteOpen: true` en el tab activo; el restore, el sanitize y la hibernacion no tocan los campos de nota.
- Render condicional: `PaneView` monta la nota (la condicion de `noteOpen` se cumple) y los tests de montaje del componente pasan.
- Perdida de `noteOpen` al cerrar la app (Cmd+Q, flush del debounce, blur de la nota): el flujo de cierre preserva el estado.

### Causa raiz

En el primer montaje de un pane (el arranque), el `useLayoutEffect` de `FloatingTabNote` corre antes de que React asigne el ref del contenedor del pane: los refs de los ancestros se adjuntan despues de los layout effects de los hijos. `measure()` sale por su early return silencioso, y el efecto del ResizeObserver tampoco se registra (mismo early return). Como las dependencias de ambos efectos no cambian despues, nadie vuelve a medir: `m` y `pos` quedan null y la nota lleva la clase `invisible` indefinidamente. Al remontar la nota (toggle) el pane ya tiene su ref asignado y todo funciona, por eso el remedio manual la revive.

Evidencia: instrumentacion temporal que enviaba `{m, pos, refs}` por fetch a un servidor HTTP local durante el arranque real de la app.

### Fix

`FloatingTabNote` fusiona los dos efectos en uno: `attach()` registra el ResizeObserver y mide, y si `paneRef.current` o `noteRef.current` aun son null reintenta en `requestAnimationFrame`, cuando el commit ya termino. Test de regresion en `FloatingTabNote.test.tsx` montando la nota con el ref del pane sin asignar y asignandolo despues.

### Leccion

Un early return silencioso en un camino de medicion puede dejar un componente montado pero invisible para siempre si nada re-dispara la medicion. El orden real de attach de refs frente a los layout effects solo se manifiesta en el primer montaje del padre, asi que los tests con refs pre-asignados no lo cubren: hay que montar con el ref vacio. Y para observar valores del webview en un arranque real, un fetch a un servidor local resulta mas fiable que cualquier intento de leer la consola.

## Bug 22: volver de Settings cerraba y guardaba el campo de renombrar (RESUELTO)

### Sintoma

Con el campo de renombrar de un tab o workspace abierto, abrir Settings (la rueda del propio
field, un atajo o lo que sea): al volver a la ventana principal el campo se cerraba solo y, si
estaba vacio, el titulo se guardaba como vacio (el tab volvia al titulo por defecto). Variantes
segun como se abria: si la rueda cerraba el field para abrir Settings, al volver el context menu
lo reabria y lo cerraba en cascada. El campo sobrevive sin problema a un cambio de tab o de
workspace mientras la app no pierde el foco del OS.

### Pistas falsas descartadas

- Persistencia del store: `clearRename` solo corre desde los handlers del field (save, cancel,
  unmount); nada la invoca al abrir Settings.
- Interplay con `requestSave`/`saveSeq` (desde entonces eliminados): era un mecanismo de guardado
  secundario, no la causa.
- RadixPopover reacciona a focos externos: si la apertura de Settings quitase el foco del input,
  el close seria inmediato, no al volver.

### Causa raiz

`App.tsx` replantea el foco al terminal activo cuando la ventana recupera el foco del OS
(`getCurrentWindow().onFocusChanged(focused)` -> `requestAnimationFrame(() => requestLeafFocus(tabId))`).
Abrir Settings roba el foco del OS y al volver DISPARA ese handler: `requestLeafFocus` hace focus()
del textarea invisible de xterm y el input del rename pierde el foco del DOM. Un blur del input
equivale a guardar y cerrar (`onBlur` -> `handleSave`), asi que se commitea el valor medio escrito
(o vacio) y el popover se va. No interviene ningun evento `blur` nativo del input al perder el foco
del OS (el webview no dispara blur en ese caso), por eso el field aguanta los Cmd+Tab y solo muere
al volver.

Evidencia: instrumentacion temporal por fetch a un servidor HTTP local (dbg en `onFocusChanged`,
`requestLeafFocus` y los save/cancel de ambos fields), mas repro manual en la app corriendo.

### Fix

Guard en el replanteo de foco: `domFocusHoldsOsRefocus(document.activeElement)`
(`src/app/lib/osRefocus.ts`) devuelve true si el elemento con foco es INPUT/TEXTAREA/contentEditable
pero no el textarea helper de xterm (ese SI cede a `requestLeafFocus`, que es su mecanismo natural).
Asi el replanteo sigue funcionando para terminales mientras un field de rename, la sticky note o
cualquier input del usuario conserva el foco.

### Leccion

Cualquier restore automatico de foco disparado por `onFocusChanged` pisa el foco del DOM que el
usuario tenia antes del Cmd+Tab, y el webview no avisa por Blur: hace falta comprobar
`document.activeElement` en el camino del restore. Si un Bug de "algo se me apaga al volver de
otra ventana" aparece, buscar primero este patron.

## Bug 23: el tab seguia mostrando el titulo del agente despues de salir de omp o pi (RESUELTO)

### Sintoma

Un tab donde se arranco `omp` (o `pi`) conservaba el nombre que la TUI escribia con OSC 0
("pi > Kex") una vez el agente terminaba, y ese nombre reaparecia tras reiniciar la app. Con
claude y opencode el titulo se normalizaba solo al salir, sin nada raro que ver en Kex.

### Pistas falsas descartadas

- Que el detector Rust no emitiera `exited`: el log (`kex_lib::modules::pty::agent_detect`) mostraba
  el ciclo completo para omp: `osc133 C: armed agent=omp` y despues `D: exited` + `detach`.
- Que frontend pasara de la senal: `AgentNotificationsBridge.handleSignal` con `exited` hace
  `store.finish` y `agent_detach_session`; el icono del agente si se apagaba.
- Que el titulo viniera de la plantilla de Kex: la de agente es `{osc|session|{agent}}` y la de
  terminal manda el `{cmd|osc}`; el texto "pi > Kex" es literalmente lo que pi escribio por OSC 0.

### Causa raiz

La TUI de pi/omp pone el titulo del terminal ("pi > carpeta") y, al salir, no restaura ni borra lo
que escribio: su OSC 0 queda como ultima escritura. Kex guarda ese titulo en dos sitios
(`oscTitleStore` en memoria y `Tab.agentTitle` persistido en el JSON del workspace, via
`agentTitleSync`), y nunca lo borra cuando la sesion muere: `clearOscTitle` solo se llama al
respawnear/disposear. La integracion de shell no escribe titulo en el prompt, asi que nada pisa el
nombre del agente. Los otros agentes (claude, opencode) reescriben el titulo al salir por su cuenta,
por eso ahi no se veia.

### Fix

- `AgentNotificationsBridge.handleSignal`, rama `exited`: en el mismo `if (detachesRecord(...))`
  (que ya excluye la hibernacion) se llama a `clearOscTitle(tabId)`.
- `startAgentTitleSync` ahora conoce el final de la sesion: cada tab cuyo titulo persistido nacio
  de una sesion de agente se revoca en cuanto la sesion desaparece (path de revoke ->
  `clearAgentTitles` en `useWorkspaces` -> funcion pura en `agentTitles.ts`), sin esperar a la
  senal: cubre detach manual, discard de restore y el arranque tras un cierre en carrera. La revocacion esta
  protegida (shield) mientras el workspace hiberna o un plan de restore o snapshot staged puede
  reclamar el tab, y espera a que `restorePlansReady()` se resuelva para no pisar los planes que
  llegan async al arrancar. La revocacion una vez aplicada no se deshace: si la sesion revive, la
  primera lectura del titulo vuelve a persistirla.
- El titulo propio del usuario (`tab.title`) siempre gana y no se toca en ningun camino.

### Leccion

Cuando un dato del agente se cachea en memoria y en disco, el final de la sesion del agente tiene
que ser un evento de borrado de las dos caches con las mismas reglas que la sesion (escudo de
hibernacion y de restore). La diferencia entre "claude se arregla solo y omp no" era el olfato: si
una cosa se limpia sola con un agente y no con otro, mirar que escribe cada uno al SALIR, no solo
al arrancar.

## Bug 10: el foco y la seleccion del input de la paleta de comandos se perdian o no existian (RESUELTO, TASK-874)

### Sintoma

Al reabrir Find in Files las dos mejoras acordadas no se veian: el texto de busqueda no
aparecia seleccionado (habia que reescribir la query entera) y, tras abrir un hit, el foco
del input se recuperaba solo a veces.

### Pistas falsas investigadas (para no repetirlas)

1. **Radix Dialog no-modal despide por focus-outside** (onFocusOutside en el DismissableLayer):
   cierto y ya corregido por su cuenta (la paleta ignora el despido por foco y solo cierra con
   Escape o click fuera), pero no explicaba la seleccion perdida.
2. **Orden del refocus contra el commit de React**: se penso que el input.select() a 0 ms corria
   antes de que la query restaurada llegara al DOM. En happy-dom el select con el buscador
   correcto funciona al primer intento; el orden no era el problema.

### Causa raiz

`document.getElementById("kex-command-palette-input")` SIEMPRE devolvia null: cmdk renderiza
su `<input>` con `id={b.inputId}` (useId de Radix) DESPUES de hacer spread de los props, asi
que el id custom del palette nunca llega al DOM. Todos los refocus y selects por id eran
no-ops silenciosos; el foco que si se veia venia del autofocus automatico de Radix
FocusScope (focusFirst con select: true). Los catch de "funciona por lo del autofocus"
disfrazaban el fallo.

### Fix

- `paletteInputElement()` consulta `[cmdk-input=""]` (CommandPalette.tsx); nada depende del id.
- La seleccion de la query restaurada corre tras el timer a requestAnimationFrame para cubrir
  el caso (real en webview) de que el re-render con el valor llegue despues del timer; si el
  valor ya esta en el DOM se selecciona; si nunca llego, no se toca.
- `selectOnReopen.test.tsx` fija la invariante (reabrir restaura y selecciona) con el mismo
  selector.

### Leccion

Nunca confiar en un id propio para llegar a un elemento renderizado por un tercero (cmdk o
Radix): o se comprueba en el DOM real que el id sobrevive al spread del wrapper, o se consulta
por un marcador que el propio tercero escribe. El no-op silencioso de getElementById se
se disfrazaba de "el autofocus de Radix lo cubre" y costó varias rondas de pase GUI en encontrarlo.

## Bug 24: arrastrar un fichero fuera de la ventana no arrancaba el drag del sistema (RESUELTO, TASK-6)

### Sintoma

El drag de una fila del explorer (o de un tab de fichero) se cancelaba al salir de la ventana y
no llegaba nada a Finder, al escritorio ni a un navegador.

### Pistas falsas investigadas (para no repetirlas)

1. **Detectar la salida con `mouseleave` en `document.documentElement`**: nunca se disparaba con
   `relatedTarget === null`. dnd-kit mantiene el puntero capturado mientras dura el drag, asi que
   WKWebView no genera la salida de ventana; solo emite `pointerleave`/`mouseleave` entre elementos
   internos, todos con `relatedTarget` distinto de null.
2. **Suponer que el arrastre nativo no admite arrancar a mitad de gesto**: tampoco era eso. Con el
   traspaso ya disparado, `startDrag` si arranca con el boton aun pulsado.

### Causa raiz

Dos causas, una encima de la otra. Primera, la deteccion de salida se apoyaba en un evento que la
captura del puntero suprime; `pointermove` si sigue llegando con `clientX`/`clientY` fuera del
viewport (se midio `x = -234` con una ventana de 1720 de ancho) y `buttons === 1`. Segunda,
`tauri-plugin-drag` exige el icono como `data:image/png;base64,...`; con base64 a pelo lo trata
como ruta y falla con `drag image not found`.

### Fix

- `pointerLeftWindow` sobre `pointermove` (capture) en `WorkspaceDndProvider`; al cumplirse se
  cancela el drag de dnd-kit reenviando Escape y se llama a `startNativeFileDrag`.
- El icono se rasteriza a PNG con un canvas al empezar el drag y se pasa con su prefijo data URI.
- `isOwnNativeDrag` hace que `useExplorerFileDrop` y `useTerminalFileDrop` ignoren el mismo drag
  cuando vuelve a caer sobre Kex.

### Leccion

Con dnd-kit activo no existen eventos de salida de ventana; se detecta por coordenadas en
`pointermove`. Y para depurar el webview de un drag no basta la consola: la tecnica del `fetch` a
un receptor local (memoria `reference_webview_debug_via_fetch`) dio el diagnostico en una sola
prueba, y habria evitado la primera ronda a ciegas.

## Bug 25: el modal de una Action se cerraba solo al cambiar su ambito en Settings (RESUELTO)

### Sintoma

En Settings > Actions, al cambiar el radio Global / This workspace del modal de una Action, el modal
a veces se cerraba solo. No pasaba siempre.

### Pistas falsas descartadas

1. **Hueco entre listas** (la Action fuera de las dos a la vez): `moving` ya lo cubria, y tres tests
   que simulan ese hueco, y que la Action aterriza antes de salir de la vieja, pasaban sin cambios.
2. **Remonte de la seccion o del dialogo** (`key`, `nonce` de `SettingsApp`, `onOpenChange` de Radix):
   nada de eso cambia al mover una Action.

### Causa raiz

`ActionsColumns` solo recordaba que la Action se estaba moviendo hasta que aparecia en el ambito
nuevo (`moving` se pone a null entonces). El movimiento cruza dos almacenes con eco asincrono (la
lista global por preferencias en disco, la del workspace por un evento de la ventana principal), asi
que puede llegar despues una lista desfasada sin la Action. `editedAction` pasaba a null y el modal
se desmontaba.

### Fix

`moved` guarda el id de la Action movida hasta que se cierra el modal, y mientras tanto `editedAction`
cae a la ultima copia vista si una lista desfasada la quita. `change` no escribe en un ambito donde la
Action no esta. Test: `ActionsColumns.test.tsx`, "a stale list drops the Action".

### Leccion

Un estado "en transito" que se limpia al primer eco no cubre ecos desordenados: mantenerlo hasta que
termine la sesion que lo necesita (aqui, la vida del modal).

## Bug 26: el listener unico de hooks descartaba todas las tramas en macOS (RESUELTO, TASK-736)

### Sintoma

Al cambiar la lectura de cada conexion del socket de hooks por un plazo total (`read_frame` con un `Instant` limite y
`set_read_timeout` con el tiempo restante antes de cada `read`), ningun hook llegaba: los tests del listener con dos
pestanas y con un cliente lento fallaban, y tambien uno que solo escribia `{"x":1}` y cerraba.

### Pistas falsas descartadas

- La logica del plazo (`checked_duration_since`, tiempo cero) era correcta.
- No era el tope de 4 MiB ni la deteccion del salto de linea.

### Causa raiz

En macOS `setsockopt(SO_RCVTIMEO)` sobre un socket Unix cuyo extremo ya cerro devuelve `EINVAL`. El codigo trataba ese
error como fallo de la conexion y devolvia `None`. Los clientes reales (`nc -U`, el `python3` del script, los plugins
con `client.end`) escriben y cierran enseguida, asi que casi siempre el listener ponia el timeout despues del cierre.

### Fix

Ignorar el error de `set_read_timeout`: si el otro extremo cerro, el `read` no puede bloquear y devuelve los datos
pendientes y luego EOF.

### Leccion

En macOS no se puede usar el resultado de `set_read_timeout` como senal de que la conexion sirve. Un test con un cliente
que escribe y cierra antes de que el servidor lea lo descubre en el momento.

## Nota: un Kex instalado y uno Dev se reescriben el script de hooks (TASK-736)

`~/.config/kex/hooks/trigger-event.sh` es un solo fichero para todas las instancias, y cada una lo reescribe al arrancar
si su contenido no coincide con el que lleva embebido (`install_session_hook_script`). Con un Kex instalado anterior a
TASK-736 (script `kex-session-v12`) y un Kex Dev con el listener unico (`kex-session-v13`) abiertos a la vez, gana el
ultimo que arranco. Si gana el v12, sus tramas no llevan `tab_id`, y el listener unico de la Dev las rechaza (`Reject`,
log en debug): las pestanas de la Dev se quedan sin estado de agente hasta que la Dev vuelva a escribir el script (al
reiniciarla). Si gana el v13, el Kex instalado recibe en su socket por PTY tramas con `tab_id` y `pty_id`, que ignora,
y sigue funcionando. No hay compatibilidad hacia atras: se resuelve actualizando el instalado.

## Nota: hibernar por tab, los invariantes que se rompen sin avisar (TASK-901)

La hibernacion paso de ser una bandera del workspace a ser un estado del tab (`Tab.hibernation`). Un tab dormido conserva
su id, y de eso cuelgan varias cosas que no fallan con ruido si se tocan mal:

- **El registro de sesion del agente se indexa por id de tab.** Se conserva porque `hibernatingTabs` hace que la senal
  `exited` del PTY recien matado no llame a `agent_detach_session`, y porque `window_state.rs` `terminal_tab_ids` cuenta
  los tabs dormidos como conocidos (`split_orphans` borraria el registro de un tab que no esta en ninguna ventana). El test
  `terminal_tab_ids_includes_hibernated_tabs` lo fija. Cerrar un tab dormido hay que quitarlo de `hibernatingTabs` (`closeTab`), o la marca
  se queda para siempre.
- **Deshacer el cierre de un tab dormido lo reabre despierto.** `buildReopenedTab` quita `hibernation`; si no, el tab
  nuevo (con id nuevo) montaria como un placeholder sin PTY y sin plan de resume sembrado. Deshacer el cierre de un
  workspace hace lo contrario con los tabs dormidos: `reviveWorkspace` les conserva el id y la bandera, porque su plan
  se siembra al despertar y no al reabrir, y solo a los demas terminales les da id nuevo.
- **Desmontar el `TerminalPane` no libera el slot.** Lo libera el barrido de `App.tsx` (`liveTerminalIds`, que deja fuera
  los dormidos) llamando a `disposeSession`, que cierra el PTY y `disposeLeafSlot`. Si un tab dormido siguiera en ese
  conjunto, su xterm y su contexto WebGL se quedarian vivos dentro de un pane vivo. Lo cubre el test de `liveTerminalIds`.
- **Correr un script sobre un tab dormido.** Si el tab enlazado se despertaria como una shell vacia (su `hibernation` no
  tiene ni `command` ni `agent`) se despierta y se reutiliza; si se despertaria ejecutando algo, se abre uno nuevo, o el
  comando se teclearia encima del Restore Command. La decision usa la instantanea (`LinkedTab.sleeping`), no el plan de resume, que es
  asincrono.
- **Bloquear lo justo.** Con el tab enfocado dormido solo se bloquea lo que actua sobre una terminal viva
  (`terminal.*`, `search.focus`, `history.open`) y las Actions que dependen del tab enfocado. Bloquear tambien tab, pane,
  sidebar o el menu nativo (como hacia la version por workspace) deja inutil un workspace entero por un solo tab dormido.

## Nota: hibernar o cerrar un tab con el restore bloqueado

El bloqueo de un restore (el dialogo "could not be restored" y el plan pendiente) vive solo en memoria (`Session.restoreBlock`, `pendingRestore`). Al hibernar o cerrar ese tab se perdia, y al volver el arranque recalculaba el estado desde `tab.cwd` y `persistentCommand`, que ya no decian lo mismo (otra carpeta, el comando ejecutado en Home). Ahora el tab que se para lleva `HeldBlock` (`TabHibernation.held` al hibernar, `Tab.held` en la entrada del closed stack), `liveHeldBlock` lo lee de `pendingRestore.ts`, y al despertar o deshacer se siembra con `seedHeldBlock` bajo el id nuevo; `startLeaf` lo consume y rehace el mismo dialogo (o deja solo el plan pendiente si no era modal) sin recalcular. Limite conocido: un tab de agente cerrado y reabierto cambia de id, y "Try again" busca el plan por el id nuevo.

Al hibernar, el placeholder muestra siempre el comando que se ejecutara (`hibernatedCommand`): el escrito a mano si lo hay, si no el capturado, que con un plan bloqueado es `attemptedCmd`. El menu Restore Command de un tab dormido edita ese mismo valor. Un comando a mano gana al plan del agente al despertar o deshacer (`manualCommandWins`: no se siembra el plan), y el error retenido solo se repone si su comando no se ha editado (`heldBlockStillValid`). Vaciar el campo devuelve el comando automatico.

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
`click` — ahi es donde se enfoca el scratchpad, como ULTIMA accion del gesto completo (despues del
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
(`Cmd+U`/`cycleScratchpad`) — cambiar de Tab NUNCA lo reactivaba, por diseño ("survives tab blur").
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
(`CoreBrowserTerminal`), sin ninguna llamada nuestra en medio — no es un bug en nuestro codigo de
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

1. **`OSC 777` / `AgentSignal.message`**: el protocolo custom de hooks de Claude Code
   (`agent_detect.rs`, evento `kex:agent-signal`) trae un campo `message` en eventos
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

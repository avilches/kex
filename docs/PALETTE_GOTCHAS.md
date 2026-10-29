# Command palette - bugs encontrados y como se resolvieron

Registro de los problemas de la paleta (`src/modules/command-palette/`) que costaron mas de un
intento de diagnostico. El mapa del subsistema esta en `docs/ARCHITECTURE.md`.

---

## Bug 1: la paleta abre con el cursor en "Global actions" y la lista scrolleada (RESUELTO)

### Sintoma

Con la caja vacia, el cursor no quedaba en la primera fila sino en una fila de mas abajo (una
Action global), y la lista aparecia scrolleada hasta ella, con "Current tab" fuera de la vista. Los
tests con cmdk real pasaban.

### Pistas falsas descartadas

- cmdk (1.1.1) eligiendo otra fila al registrar los items: `selectFirstItem` toma el primero en
  orden de DOM y solo se dispara con el valor vacio. No mueve a una fila de abajo.
- `scrollIntoView` de cmdk: solo sigue al item seleccionado; si el seleccionado era el correcto la
  lista queda arriba. El scroll era consecuencia, no causa.
- Las variables de modulo del modo contenido (`lastContentValue`, `lastContentScrollTop`): solo se
  leen con `initialMode === "content"`.

### Causa raiz

`pickedValue` (la fila resaltada) es estado de `CommandPalette`, que no se desmonta al cerrarse; lo
que se desmonta es el contenido del dialogo. Solo `handleOpenChange(false)` llamaba a
`resetPalette()`, que lo vacia. Pero `App.tsx` cierra la paleta tambien con
`setCommandPaletteOpen(false)` directamente (`dismissPalettes`, que llaman los atajos globales de
tabs y workspaces; `openTerminalAtPaletteTarget`; el atajo `tab.new`), sin pasar por `handleOpenChange`. La
fila resaltada de la sesion anterior (una Action global, por ejemplo) sobrevivia y la apertura
siguiente la recibia como valor controlado de cmdk, que la resaltaba y hacia scroll hasta ella.
Los tests cerraban con Escape (que si pasa por `handleOpenChange`) o no cerraban nunca, asi que no
veian el camino.

### Fix

- `useEffect(() => { if (!open) setValue("") }, [open])`: la fila recordada se descarta siempre que
  `open` pasa a false, lo cierre quien lo cierre.
- La fila inicial es la primera dibujada (`initialKey`, que usa `displayOrder`), pasada como valor
  controlado desde el primer render; ya no se apoya en que cmdk vuelva a elegir la primera al salir
  de una subpagina con el valor vacio.
- El viewport vuelve a `scrollTop` 0 en cada consulta (`scrollListToTop`); al abrir ya empieza arriba porque Radix desmonta el contenido al cerrar.
- `openCursor.test.tsx` cierra desde fuera (`open=false` del padre) con una lista tan larga como la
  real; sin el efecto, el test recibe `act:g1`.

### Leccion

Un estado que se resetea en el handler de cierre del componente no se resetea si el padre cierra
por la prop. Resetea en funcion de `open`, no del camino por el que se cierra, y prueba cerrando
desde el padre, no solo con Escape.

---

## Bug 2: la paleta vuelve a abrir en la primera Action global tras cerrarla con Escape o clic fuera (RESUELTO)

### Sintoma

Solo en el build de produccion: la primera apertura caia en Current tab, pero tras cerrar con Escape o
con un clic fuera, las siguientes abrian con el cursor en la primera Action global, siempre. Cerrar
eligiendo una tab no lo provocaba. En `pnpm tauri dev` no se reproducia, ni tampoco en los tests.

### Pistas falsas descartadas

- El reseteo del Bug 1 (`if (!open) setValue("")`): estaba y se ejecutaba.
- Un build antiguo: el de produccion era posterior al fix del Bug 1.
- La animacion de salida en happy-dom: forzandola con `[data-state="closed"] { animation-name }` el
  dialogo se queda montado, pero cmdk no avisa y el test pasa con y sin el fix.

### Causa raiz

`App.tsx` solo calcula las entradas de tabs con la paleta abierta, asi que al cerrar la lista pierde
todas las tabs de golpe mientras el dialogo sigue montado ~100 ms por la animacion de salida. cmdk ve
desaparecer la fila resaltada, elige la primera que queda (la primera Action global) y llama a
`onValueChange` con la paleta ya cerrada. Ese aviso llegaba despues del reseteo y volvia a guardar la
fila en `pickedValue`; la apertura siguiente la recibia como valor controlado.

### Fix

`onValueChange` ignora lo que cmdk diga mientras `open` es false.

### Como se encontro

Instrumentando `CommandPalette` con `fetch` a un receptor HTTP local (ver
`.memory/reference_webview_debug_via_fetch.md`) y probando con el bundle de produccion
(`pnpm tauri build -b app`): el registro mostraba `cmdk-onValueChange {v: "act:...", open: false}`
justo despues del cierre.

### Leccion

Una libreria con estado interno (cmdk) sigue emitiendo cambios mientras el componente esta montado
aunque `open` sea false. Resetear al cerrar no basta: hay que ignorar sus avisos mientras esta cerrada.
Y un bug que solo sale en el build de produccion se mide con el build de produccion.

---

## Decision 2: Add/Show Note cierran la paleta, Hide/Remove Note no

Add Note y Show Note entregan el teclado a la nota, asi que se comportan como cualquier item que
mueve el foco: cierran el menu de fila y la paleta (`runAfterClose`), activan la tab con
`onGoToTab` (que no despierta una tab hibernada), piden el foco para la nota
(`useTabNoteStore.requestFocus`) y la abren. `tabItemKeepsPalette(id, entry)` decide segun el estado
de la nota: el item `note` solo deja la paleta abierta cuando oculta una nota abierta.

Hide Note y Remove Note no dan el foco a nada, asi que actuan sobre la tab por id y dejan la paleta
abierta en la misma fila con el foco en su input. No activan la tab: activarla con la paleta abierta
hace que el terminal (efecto de visible y enfocado) o un editor recupere el teclado, y ese foco no se
puede controlar sin tocar el subsistema central de terminales y workspaces. Se probo una puerta de
foco consultada por todos esos caminos y un listener de `focusin` que devolvia el foco al input, y se
descarto: demasiados puntos de control en el foco del terminal y, sobre todo, el listener peleaba con
un AlertDialog en portal (Hibernate) y con la trampa de foco de Radix.

Leccion: ningun listener global de foco debe pelearse con un dialogo en portal; una accion que da el
foco a otra cosa cierra la paleta en vez de intentar recuperarlo.

---

## Bug 3: Hibernate/Restore desde la paleta le quitan el foco (RESUELTO)

### Sintoma

Hibernar o restaurar una tab desde la paleta (item o atajo) dejaba la paleta abierta pero sin el
foco en su input; con el modal de revision, al cerrarlo (confirmar, cancelar, Escape) pasaba lo mismo.

### Pistas falsas descartadas

- Un efecto que vigilaba la prop `hibernateDialogOpen` y refocalizaba con timeouts: el test que lo
  cubria no usaba un AlertDialog real, y quitarlo no rompia ninguna prueba.
- Tocar el foco del terminal o poner un listener global de `focusin`: descartado en la Decision 2.

### Causa raiz

Con un dialogo: Radix, al desmontar el contenido, llama a `onCloseAutoFocus`; el de `AlertDialogContent`
hace `preventDefault()` y enfoca `triggerRef`, que aqui no existe (el dialogo se abre por estado, sin
trigger), asi que el foco cae en el body. Sin dialogo: el terminal despertado enfoca su slot cuando
monta (`requestLeafFocus` en el efecto de visible y enfocado); eso lo cubre `refocusInput` tras
resolverse la accion.

### Fix

`keepPaletteFocus` (`lib/keepPaletteFocus.ts`) es el `onCloseAutoFocus` de `HibernateDialog`: si hay un
input de paleta en el DOM, evita el comportamiento por defecto y le da el foco. Sin paleta no hace nada.
`hibernateFocus.test.tsx` comprueba el handler con un AlertDialog generico en portal, y `HibernateDialogFocus.test.tsx` monta el `HibernateDialog` real junto a un input de paleta simulado y comprueba que el foco acaba en el input al confirmar, cancelar y con Escape; falla si se quita el `onCloseAutoFocus` del componente.

Este fix cubre el atajo y los dialogos abiertos con el menu de fila cerrado; con el menu abierto ver el Bug 6.

### Riesgo abierto

El boton "Go to tab" del dialogo hace `onClose()` y luego `onGoToTab()`, que pide el foco del tab destino en un `requestAnimationFrame`. La paleta no se cierra con ese camino, asi que `keepPaletteFocus` sigue dando el foco al input cuando el dialogo termina de desmontarse (tras su animacion de salida), y podria pisar el foco que acaba de pedir el tab. Sin la app arrancada no se puede saber el orden real, asi que no se ha puesto ningun parche: si se confirma, la salida coherente es cerrar la paleta en ese camino, no discriminar el foco dentro del handler.

### Leccion

Un dialogo sin trigger no devuelve el foco a nadie: quien lo abre desde otra superficie debe decirle
adonde. Se resuelve en el `onCloseAutoFocus` del propio dialogo, no con timeouts ni listeners globales.

## Bug 4: la tab actual hibernada no se ve resaltada como Current tab (RESUELTO)

### Sintoma

Con la tab actual hibernada, al abrir la paleta no se distinguia como "Current tab" ni como la fila del cursor.

### Pistas falsas descartadas

`byRecency` (entonces las hibernadas iban al final; ya no), el filtro `t.tabId !== activeTabId` de `mergeRows`, la marca `current`, `initialKey` y `displayOrder`: los tests de `mergeRows.test.ts` y `openCursor.test.tsx` con cmdk real pasan sin tocar nada. La fila SI es la primera, esta bajo "Current tab" y SI tiene `aria-selected`.

### Causa raiz

`TabItem` aplicaba `opacity-40` a la propia fila del `CommandItem` cuando `entry.hibernated`. Esa misma fila lleva `data-selected:bg-accent`, asi que la opacidad atenuaba tambien el fondo de seleccion: la fila elegida quedaba casi invisible.

### Fix

La opacidad va en un contenedor interior que envuelve el contenido (no en la fila ni en un selector `[&>*]`, que tambien atenuaria el tick de seleccion de `CommandItem`, hijo directo con `opacity-0`). `ClosedItem` igual. `TabItem.test.tsx` comprueba que la fila no lleva opacidad y que el tick queda fuera del contenedor atenuado.

### Leccion

Atenuar una fila de cmdk nunca con opacidad en la raiz: arrastra el resaltado de seleccion y el foco visual.

---

## Decision 5: Move to Workspace es un nivel del menu de fila, no una subpagina

El menu de fila guarda el menu que sustituye (`RowMenuState.parent`) y `useRowMenu` expone `enter` / `back`; Escape (listener en captura, antes que Radix, salvo que haya un AlertDialog abierto, ver Bug 6) vuelve un nivel y solo cierra el menu desde la raiz. Los digitos de los destinos usan `palette.menuAction`, que la paleta de comandos no dejaba pasar: `paletteGate` lo permite ahora y `registerPaletteControl` lo atiende (con menu abierto ejecuta el item cuyo `digit` coincide; sin menu o sin ese item consume la tecla sin efecto, asi `workspace.selectByIndex` nunca salta de workspace con la paleta abierta).

El comando "Move tab to workspace..." mueve la tab activa: limpia la consulta (con texto la fila Current tab puede no estar en la lista) y abre el menu de esa fila ya en el nivel de destinos. Un `useEffect` sobre `pendingMove` espera a que la consulta este vacia y la fila exista en el DOM antes de anclar el menu; no se ancla en el mismo tick que `setQuery("")` porque la lista aun es la filtrada.

Leccion: un atajo que el gate bloquea no llega nunca al `registerPaletteControl`; ampliar lo que un menu acepta empieza por `PALETTE_ALLOWED_SHORTCUTS` y su test que recorre el registry.

---

## Bug 6: Hibernate Tab desde el menu de fila pierde el foco al pulsar Escape en el dialogo (RESUELTO)

### Sintoma

Con la paleta abierta y la tab activa ocupada, el atajo `tab.hibernate` abre el dialogo de revision y Escape devuelve el foco a la paleta. Eligiendo Hibernate Tab desde el menu de fila (Tab, Enter o clic) el dialogo sale igual, pero Escape no lo cierra y el foco acaba fuera de la paleta.

### Pistas falsas descartadas

- `keepPaletteFocus` / `onCloseAutoFocus` (Bug 3): sigue bien; en este camino ni llega a ejecutarse porque el dialogo no se cierra.
- Los timeouts de `refocusInput` (0 y 250 ms), que corren con el dialogo todavia abierto porque la promesa de `onHibernateTab` resuelve al abrirlo: Radix mantiene el foco dentro de su trampa y no cambia el resultado.
- El foco previo guardado por el dialogo (un item del menu desmontado): el dialogo no llega a cerrarse, asi que no se usa.

### Causa raiz

`tabItemKeepsPalette("hibernateTab")` es true, asi que `runTabAction` no llama a `closeRowMenu()` y el menu de fila sigue abierto cuando aparece el dialogo. Mientras esta abierto, `useRowMenu` escucha Escape en `window` en captura y hace `preventDefault` + `stopPropagation`: el evento no llega a Radix (que escucha en `document`), el dialogo no se cierra y el menu se cierra en su lugar. El atajo funciona porque no abre el menu. Evidencia (`hibernateFromRowMenu.test.tsx`): al abrirse el dialogo la traza es `menu=true dialog=true`, tras Escape `menu=false dialog=true`.

### Fix

El listener de Escape de `useRowMenu` ignora el evento mientras hay un `[role="alertdialog"][data-state="open"]` (`alertDialogOpen`, en `lib/keepPaletteFocus.ts`). Escape lo atiende Radix, el dialogo se cierra y `keepPaletteFocus` devuelve el foco al input. El menu de fila queda abierto debajo, como estaba. Escape sin dialogo sigue cerrando solo el menu.

### Close Tab / Close Workspace

No tienen el fallo: `runTabAction` y `runWorkspaceAction` llaman a `closeRowMenu()` antes de lanzar el cierre (`tabItemKeepsPalette` es false para ellos), asi que no hay listener de Escape del menu cuando sale el dialogo de confirmacion.

### Leccion

Un listener global de Escape en captura se come la tecla de cualquier modal que se abra encima. Un menu que captura Escape debe cederlo cuando hay un dialogo modal abierto, y un test de foco debe montar el estado previo real (menu abierto) y mandar la tecla real.

## Enter con un dialogo de confirmacion abierto sobre la paleta

### Sintoma

Con la paleta abierta y el dialogo de hibernar encima, Enter cerraba la paleta y dejaba el dialogo abierto, en vez de confirmarlo.

### Causa raiz

La paleta conserva el foco (el dialogo se monta en un portal sin robarlo), asi que Enter llegaba al `onKeyDown` de cmdk y elegia la fila resaltada. El foco no pasa al dialogo (la paleta es `modal={false}` y cancela `onFocusOutside`), asi que el `autoFocus` de su boton de confirmar no sirve de nada aqui.

### Fix

`onKeyDown` de `CommandPalette` comprueba `alertDialogOpen()` primero: con un dialogo abierto solo Enter hace algo, y es pulsar el ultimo boton del pie del dialogo (`confirmAlertDialog`, `lib/keepPaletteFocus.ts`) si no esta deshabilitado. Cubre el camino del atajo y el del menu de fila (`hibernateFromRowMenu.test.tsx`).

### Leccion

Un modal abierto sobre una paleta que no suelta el foco debe poder recibir Enter y Escape desde ella; Escape ya lo atiende Radix, Enter hay que reenviarlo.

## Bug 7: Escape tras restaurar un tab no devuelve el foco al terminal (RESUELTO)

### Sintoma

Restaurar un tab desde la paleta (atajo, menu o item) y cerrar la paleta con Escape dejaba el foco fuera del terminal restaurado.

### Pistas falsas descartadas

- `refocusInput` y el foco del terminal al despertar: eso era el Bug 3, que ya mantenia el foco en el input mientras la paleta esta abierta.
- Un test de integracion con la paleta real en happy-dom: no sirve, porque ahi Radix desmonta el dialogo sin animacion y el input ya no esta en el DOM cuando corre `restoreFocus`; pasa con la guarda buena y con la mala.

### Causa raiz

La guarda que añadio el arreglo del Bug 3 en `focusSlot` miraba solo si existia un input de paleta en el DOM. Al cerrar con Escape, Radix deja el contenido montado unos 100 ms con `data-state="closed"` (animacion de salida), y justo entonces `useRestoreFocusOnEscape` pide el foco del terminal. La guarda veia el input, creia la paleta abierta y se saltaba ese foco.

### Fix

`paletteHoldsFocus` (`terminal/lib/paletteHoldsFocus.ts`) exige que el input cuelgue de un `[data-slot="dialog-content"][data-state="open"]`. Una paleta que se esta cerrando ya no retiene el foco. `focusSlotPalette.test.ts` fija la regla sobre el DOM que genera Radix.

### Leccion

Con Radix, "el elemento existe" no significa "esta abierto": comprobar siempre `data-state`. La animacion de salida no se reproduce en happy-dom, asi que este caso solo se verifica a mano en la app.

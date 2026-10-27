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

## Decision 2: Add/Show Note no activa la tab con la paleta abierta

Los items de nota (Add, Show, Hide, Remove) actuan por id de tab sobre el estado de la nota y dejan
la paleta abierta con la misma fila y el foco en su input. No activan la tab: activarla con la
paleta abierta hace que el terminal (efecto de visible y enfocado, desocultado diferido) o un
editor recupere el teclado, y ese foco no se puede controlar sin tocar el subsistema central de
terminales y workspaces. Se probo una puerta de foco consultada por todos esos caminos y un
listener de `focusin` que devolvia el foco al input, y se descarto: demasiados puntos de control en
el foco del terminal y, sobre todo, el listener peleaba con un AlertDialog en portal (Hibernate,
Close Other Tabs) y con la trampa de foco de Radix.

Consecuencia aceptada: si la tab no es visible, la nota no se ve hasta ir a ella. La fila ya pinta
el texto de la nota; no hay indicador de "nota abierta" sin texto.

Leccion: ningun listener global de foco debe pelearse con un dialogo en portal.

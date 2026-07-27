# M13 - Toolbar: hover del table-size picker queda obsoleto al cerrar sin elegir

**Prioridad:** Baja
**Esfuerzo:** Bajo

## Contexto

`src/modules/markdown/rich/Toolbar.tsx`, estado `tableHover` (linea 130,
`useState({ rows: 0, cols: 0 })`), usado para resaltar la grid de tamano de tabla al pasar el raton
(lineas ~797, ~817-818). Este estado solo se resetea cuando el usuario efectivamente elige un tamano; si
el picker se cierra sin seleccion (click fuera, Escape), `tableHover` conserva el ultimo valor. Al
reabrir el picker, se ve brevemente el highlight obsoleto de la vez anterior hasta que el raton vuelve a
pasar sobre una celda.

## Impacto

Puramente cosmetico. Este comportamiento imita el de la referencia HelixNotes original (heredado, no
introducido por esta implementacion), asi que es baja prioridad.

## Fix sugerido

Resetear `tableHover` a `{ rows: 0, cols: 0 }` tambien en el cierre del picker sin seleccion (mismo
punto donde se gestiona el cierre por click-fuera/Escape del menu Insert/table picker en `Toolbar.tsx`).

## Relacionado

Plan original: `docs/superpowers/plans/2026-07-06-rich-markdown-editor.md`, tarea de tablas/toolbar.

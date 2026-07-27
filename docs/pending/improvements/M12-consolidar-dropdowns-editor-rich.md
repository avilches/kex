# M12 - Consolidar las implementaciones de dropdown/floating-menu del editor rich

**Prioridad:** Baja
**Esfuerzo:** Medio

## Contexto

El editor rich markdown tiene seis implementaciones independientes de dropdown/menu flotante repartidas
en cuatro ficheros de `src/modules/markdown/rich/`:

- `Toolbar.tsx`: menu Insert, menu Heading, Text Color, table-size picker, Highlight, Align.
- `SlashMenu.tsx` (componente standalone).
- `WikiLinkMenu.tsx` (componente standalone).
- `CodeLangDropdown.tsx` (componente standalone).

Cada una reimplementa el mismo boilerplate: panel de posicion fija, cierre por mousedown fuera del
contenedor (`document.addEventListener("mousedown", ...)` + `containerRef.current.contains(...)`),
cierre por Escape, y estado open/closed local. Cada implementacion se reviso y aprobo individualmente
durante el plan (cada task reviewer solo vio un fichero cada vez); en la revision final de todo el
branch junto, la duplicacion es evidente.

## Cambio propuesto

Extraer un componente compartido (p.ej. `Dropdown` o `FloatingMenu` en
`src/modules/markdown/rich/lib/` o `src/components/ui/`) que encapsule:

- Posicionamiento fijo (recibe `x`/`y` o un elemento ancla).
- Cierre por mousedown fuera + Escape (un unico par de listeners, no seis).
- Render prop / children para el contenido especifico de cada menu.

Migrar las seis implementaciones a usar el componente compartido, sin cambiar el comportamiento
observable de ninguna.

## Criterios de aceptacion

- Un solo componente implementa la logica de apertura/cierre compartida.
- Los seis usos (Toolbar x6, SlashMenu, WikiLinkMenu, CodeLangDropdown) lo usan sin cambiar
  comportamiento visible.
- `pnpm lint`, `pnpm check-types`, `pnpm test` en verde.

## Relacionado

No es un defecto, es limpieza DRY pura descubierta en la revision final de todo el branch (no en las
revisiones tarea-por-tarea). Plan original:
`docs/superpowers/plans/2026-07-06-rich-markdown-editor.md`.

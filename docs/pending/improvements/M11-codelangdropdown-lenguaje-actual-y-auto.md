# M11 - CodeLangDropdown: mostrar lenguaje actual y opcion "auto"

**Prioridad:** Baja
**Esfuerzo:** Bajo

## Contexto

`src/modules/markdown/rich/CodeLangDropdown.tsx` (+ `src/modules/markdown/rich/extensions/codeBlock.ts`)
es el dropdown de seleccion de lenguaje de un bloque de codigo en el editor rich markdown. Hoy:

- No resalta ni indica en ningun sitio cual es el lenguaje **actualmente** asignado al bloque cuando se
  abre el dropdown (la lista `filtered` en `CodeLangDropdown.tsx` no marca la entrada activa).
- No hay ninguna opcion "auto" / "none" para volver un bloque a sin-lenguaje (auto-deteccion), una vez
  que se le ha asignado uno explicitamente. Solo se puede sustituir un lenguaje por otro de la lista.

## Cambio propuesto

1. Pasar el lenguaje actual del bloque a `CodeLangDropdown` (via `CodeLangDropdownState` en
   `extensions/codeBlock.ts`) y resaltarlo visualmente en la lista (p.ej. fondo distinto o check al lado
   del boton correspondiente).
2. Anadir una entrada "Auto" (o "None") al principio de la lista filtrada que, al seleccionarse, quite el
   atributo de lenguaje del bloque de codigo (vuelve al estado sin-lenguaje / auto-deteccion).

## Criterios de aceptacion

- Abrir el dropdown sobre un bloque de codigo con lenguaje ya asignado muestra visualmente cual es.
- Seleccionar "Auto" limpia el lenguaje del bloque.
- `pnpm lint`, `pnpm check-types`, `pnpm test` en verde.

## Relacionado

Plan original: `docs/superpowers/plans/2026-07-06-rich-markdown-editor.md`, tarea de bloques de codigo.
Puramente aditivo, sin comportamiento incorrecto hoy.

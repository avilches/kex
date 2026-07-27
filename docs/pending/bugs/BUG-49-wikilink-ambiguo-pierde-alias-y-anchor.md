---
id: BUG-49
title: Wiki-link ambiguo pierde el alias del pipe y el anchor heading/block al resolver
area: markdown / rich editor / wiki-links
severity: low
status: sin confirmar
---

## Descripcion

`src/modules/markdown/rich/extensions/wikiLink.ts`, dentro de `handleTextInput` (deteccion de `]]` de
cierre, alrededor de la linea 302-340): cuando un `[[Titulo]]` referencia un titulo que coincide con
**mas de un** fichero (`matches.length > 1`, linea 324), el codigo mantiene el menu de autocompletado
abierto para desambiguar, reutilizando la lista de menu filtrado normal en vez de una UI de
desambiguacion dedicada:

```ts
} else if (matches.length > 1) {
  // Keep the menu open but filter to only the matching entries, reusing
  // the normal filtered-menu list instead of a separate disambiguation UI
  menu.set({ ...menuState, query: titleForLookup });
  selected.set(0);
}
```

El problema: cuando el usuario finalmente selecciona una de las entradas del menu para desambiguar, el
flujo de insercion normal del menu no conserva ni el texto de alias que el usuario ya habia escrito tras
el `|` (`display`, capturado en la linea 314 pero descartado en esta rama) ni el `#heading`/`^block`
anchor que hubiera en `noteRef` (linea 313, tambien descartado). Ejemplo: `[[Note|Custom text]]` donde
"Note" es ambiguo termina insertando el titulo real de la nota resuelta como texto visible, no "Custom
text", y cualquier `#heading`/`^block` que el usuario hubiera tecleado se pierde.

## Origen

Simplificacion deliberada, sancionada por el brief original de la tarea (que explicitamente pedia
descartar el estado de submenu de desambiguacion multi-match y reutilizar la lista de menu filtrado
normal). No es un descuido del implementador. Ver
`docs/superpowers/plans/2026-07-06-rich-markdown-editor.md`, tarea de wiki-links.

## Impacto

Narrow, edge case real y visible para el usuario: solo se dispara cuando el titulo referenciado en un
wiki-link con alias y/o anchor es ambiguo entre varios ficheros del vault. Cuando ocurre, el usuario
pierde el texto de alias personalizado y el anchor sin previo aviso.

## Fix sugerido

Al entrar en la rama `matches.length > 1`, guardar `display` y el anchor (`#heading`/`^block` extraidos
de `noteRef`) en el estado del menu (extender `menuState` con estos campos), y al confirmar la seleccion
del menu para ese caso, usarlos en vez de recalcular el texto visible desde el titulo resuelto. Anadir un
test que cubra `[[Note|Custom text]]` con "Note" ambiguo, verificando que "Custom text" y cualquier
anchor sobreviven a la resolucion.

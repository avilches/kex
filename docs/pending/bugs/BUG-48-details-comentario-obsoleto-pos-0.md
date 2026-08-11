---
id: BUG-48
title: details.ts - comentario sobre bug pos-0 de @tiptap/extension-details puede estar obsoleto
area: markdown / rich editor
severity: low
status: sin confirmar
---

## Descripcion

`src/modules/markdown/rich/extensions/details.ts`, extension `DetailsOpenAttrSync` (linea 90), tiene
este comentario junto al `click` handler (linea 106-108):

```ts
// The extension's button handler already toggled the is-open class; sync
// node.attrs.open to it. Fixes the first node (pos 0), where upstream's
// `if (!pos)` guard skips persisting the attribute.
```

La version actualmente fijada es `@tiptap/extension-details@3.27.1` (`package.json:76`). No esta
confirmado que esa version siga teniendo el bug descrito (`if (!pos)` tratando la posicion 0 como
falsy). El codigo de esta extension no depende de que el bug exista: la comparacion de igualdad en
`resolved.node(d).attrs.open !== isOpen` (linea 122) hace que el `dispatch` extra sea un no-op cuando no
hace falta, asi que el comportamiento es seguro este o no presente el bug upstream. El unico problema es
que el comentario puede estar desactualizado.

## Impacto

Ninguno funcional. Solo documental: un futuro mantenedor que lea el comentario puede perder tiempo
intentando reproducir un bug upstream que ya no existe en la version fijada.

## Fix sugerido

1. Verificar contra el codigo fuente de `@tiptap/extension-details@3.27.1` (o la version que este
   fijada en ese momento) si el guard `if (!pos)` (o equivalente) sigue tratando la posicion 0 de forma
   incorrecta.
2. Si ya no aplica: corregir o eliminar el comentario, dejando claro que `DetailsOpenAttrSync` sigue
   siendo necesaria solo si hay otra razon (o evaluar si la extension entera se puede simplificar/
   eliminar).
3. Si sigue aplicando: anadir el numero de version verificado al comentario para que quede claro hasta
   que version se confirmo.

## Relacionado

Plan original: `docs/superpowers/plans/2026-07-06-rich-markdown-editor.md`, tarea de la extension
`details`/callouts colapsables.

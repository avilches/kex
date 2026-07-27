---
id: BUG-45
title: htmlToMarkdown - alt de imagen y texto de link sin escapar caracteres markdown-significativos
area: markdown / rich editor
severity: low
status: sin confirmar
---

## Descripcion

En `src/modules/markdown/lib/htmlToMarkdown.ts`, las funciones `serializeImage` (linea ~61-70) y el
case `"A"` de `serializeInline` (linea ~368-372) escriben el `alt` de la imagen y el texto interno del
link tal cual, sin escapar los caracteres que son significativos en la sintaxis markdown de imagen/link:
`]`, `)`, `|`.

```ts
function serializeImage(img: Element): string {
  const src = img.getAttribute("src") ?? "";
  if (!src) return "";
  const alt = img.getAttribute("alt") ?? "";
  const size = img.getAttribute("data-size") || "full";
  const sizeSuffix = size !== "full" ? `|size=${size}` : "";
  return `![${alt}${sizeSuffix}](${src})`;
}
```

Un `alt="a [b] (c) | d"` produce `![a [b] (c) | d](src)`, que no es sintaxis CommonMark valida (el `]`
cierra prematuramente el texto alt, el `)` rompe el destino, y el `|` puede confundirse con el separador
de la extension `|size=`). Lo mismo aplica al texto interno de un link (`[texto](href)`).

## Origen

Heredado del pseudocodigo del brief original de la tarea (tampoco especificaba escapado), documentado en
`docs/superpowers/plans/2026-07-06-rich-markdown-editor.md`. No es un defecto de implementacion: es un
hueco de la spec original que quedo pendiente.

## Impacto

Bajo: requiere que el usuario escriba manualmente `]`, `)` o `|` dentro del texto alt de una imagen o del
texto visible de un link (via el editor rich, no tecleando markdown crudo). El resultado round-tripea a
markdown invalido, que puede renderizar mal o desalinear la tabla si el link/imagen vive dentro de una
celda.

## Fix sugerido

Anadir una funcion de escape (p.ej. `escapeLinkText(s: string): string` que sustituya `]` por `\]`, y
opcionalmente `[` por `\[`) y aplicarla al `alt` en `serializeImage` y al resultado de `inner()` en el
case `"A"` de `serializeInline`. Verificar contra markdown-it que el escape se decodifica de vuelta
correctamente en el HTML resultante (round-trip completo).

## Relacionado

- BUG-49 no aplica aqui, es un bug distinto (wiki-links). Este item cubre solo image-alt y link-text.

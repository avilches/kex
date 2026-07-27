---
id: BUG-46
title: htmlToMarkdown - una tabla con 0 filas no se descarta como el parrafo vacio
area: markdown / rich editor
severity: low
status: sin confirmar
---

## Descripcion

En `src/modules/markdown/lib/htmlToMarkdown.ts`, `htmlToMarkdown()` descarta explicitamente los
parrafos vacios usando un sentinel `"<!-- -->"` (lineas 10-12 y 19-21). No existe un tratamiento
equivalente para una tabla `<table>` genuinamente vacia (0 filas): `tableToMarkdown()` (linea ~289)
devuelve `""` cuando `rows.length === 0`, pero `serializeTable()` (linea ~306) sigue envolviendo ese
resultado en un template literal (`` `${tableToMarkdown(el)}\n` ``, linea 321), asi que el entry final
para esa tabla no es realmente vacio: es `"\n"`. Ese entry no coincide con el sentinel `"<!-- -->"` y por
tanto sobrevive al filtro de entries vacios al final del fichero, dejando una linea en blanco espuria en
el markdown de salida en vez de desaparecer.

## Impacto

Cosmetic/narrow: una tabla de 0 filas es muy improbable que salga del editor rich real (TipTap siempre
inserta al menos una fila de encabezado al crear una tabla), asi que es dificil de disparar desde la UI.
No hay crash ni perdida de datos, solo una linea en blanco extra en el markdown guardado.

## Fix sugerido

En `serializeTable`, si `tableToMarkdown(el)` devuelve `""` (tabla sin filas), devolver el mismo sentinel
`"<!-- -->"` que usan los parrafos vacios (o devolver `""` directamente y ajustar el `entries.push` en
`htmlToMarkdown` para marcar `isImage`/vacio de forma coherente), de modo que el filtro final de
`entries` la elimine igual que un parrafo vacio.

## Relacionado

Plan original: `docs/superpowers/plans/2026-07-06-rich-markdown-editor.md`, tarea de serializacion de
tablas.

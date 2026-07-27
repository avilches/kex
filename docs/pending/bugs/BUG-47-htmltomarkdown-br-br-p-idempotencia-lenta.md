---
id: BUG-47
title: htmlToMarkdown - <br><br> seguido de <p> hermano en una lista tarda 2 pasadas extra en estabilizar
area: markdown / rich editor
severity: low
status: sin confirmar
---

## Descripcion

En `src/modules/markdown/lib/htmlToMarkdown.ts`, `serializeListItem()` (linea 207) solo aplica
indentacion de continuacion (4 espacios) a los hijos `UL`/`OL` de un `<li>` (rama `node.tagName === "UL"
|| node.tagName === "OL"`, linea 249). Un hijo `<p>` hermano dentro del mismo `<li>` no recibe ese mismo
tratamiento de indentacion.

Cuando el contenido de un `<li>` es `<br><br>` (dos hard breaks consecutivos) inmediatamente seguido de
un `<p>` hermano, el round-trip htmlToMarkdown -> markdownToHtml -> htmlToMarkdown tarda 2 pasadas extra
de normalizacion en estabilizar (converge eventualmente, no es un bug de correccion final, solo de
velocidad de convergencia / idempotencia inmediata).

## Contexto: bug mas amplio, mayormente ya arreglado

Este es un caso residual mas estrecho de una clase de bug mas amplia que se investigo y se arreglo
durante el plan (ver `docs/superpowers/plans/2026-07-06-rich-markdown-editor.md`, revision final de
codigo del branch completo). Ya se arreglaron y verificaron en review:

- Crash con `src` de imagen no decodificable (ver tambien BUG-45/BUG-49, distinto issue).
- Idempotencia de bullet vacio con lista anidada.
- Deteccion de fila 0 como encabezado en tablas.
- Idempotencia de trailing `<br>` simple y multiple.

Este item (`<br><br>` + `<p>` hermano) es el unico caso de esa familia que quedo sin resolver.

## Impacto

Narrow: requiere contenido especifico (dos hard breaks seguidos de un parrafo, dentro de una lista) para
disparar el retraso de convergencia. No hay perdida de contenido, solo pasadas de normalizacion extra
antes de que el markdown se estabilice.

## Fix sugerido

En `serializeListItem`, extender la rama de indentacion (hoy solo `UL`/`OL`) para tambien indentar un
`<p>` hermano que sigue a un buffer de texto con hard breaks, de forma simetrica a como se indenta una
lista anidada. Anadir un test de idempotencia especifico para `<li><br><br></li>` seguido de `<p>` en el
mismo `<li>`, verificando que una sola pasada de htmlToMarkdown ya es estable (output identico en
pasadas sucesivas).

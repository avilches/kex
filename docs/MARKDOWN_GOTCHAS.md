# Markdown: bugs encontrados y cómo se resolvieron

Este documento registra los problemas del subsistema markdown (conversión markdown/HTML y editor
rico TipTap) que resultaron no obvios de diagnosticar. El objetivo es que no haya que
re-descubrirlos.

El camino de guardado tiene tres capas y conviene tenerlas separadas en la cabeza, porque una
pérdida de contenido puede ocurrir en cualquiera de las tres:

```
fichero .md
  -> markdownToHtml()        (markdown-it, html: true)        src/modules/markdown/lib/
  -> documento de ProseMirror (TipTap parsea el HTML al esquema del editor)
  -> editor.getHTML()
  -> htmlToMarkdown()        (serializador que camina el DOM)  src/modules/markdown/lib/
fichero .md
```

---

## Bug 1: abrir un .md y guardar sin editar cambia el fichero (RESUELTO)

### Síntoma

Al abrir un `.md` en el editor rico y pulsar Cmd+S sin tocar nada, el fichero cambiaba. Reproducido
con el propio `CLAUDE.md` del repo: `git diff` mostró que desaparecían por completo los comentarios
HTML (`<!-- BACKLOG.MD GUIDELINES START -->` y compañía) y que un bloque ` ```tsx ` anidado dentro
de un item de lista se convertía en un span de código roto, con saltos de línea literales dentro de
un solo par de backticks.

### Pistas falsas descartadas

**El síntoma era el mismo pero los dos bugs no comparten capa.** La tentación era buscar una única
causa en el serializador. No la hay:

- El bloque de código anidado sí se rompía en la capa pura, sin que TipTap intervenga. Se verificó
  llamando a `markdownToHtml` y `htmlToMarkdown` directamente: el HTML intermedio era correcto
  (`<li><p>item text</p><pre><code class="language-tsx">...</code></pre></li>`) y era el
  serializador el que lo aplanaba.
- La pérdida del comentario no se puede reproducir en la capa pura. `markdownToHtml` conserva el
  comentario intacto (markdown-it con `html: true` lo pasa verbatim), así que un test que solo
  encadene las dos funciones puras concluye, en falso, que no hay bug.

### Causa raíz

Son dos causas independientes.

**1. `htmlToMarkdown.serializeListItem` solo reconocía `UL` y `OL` como hijos de bloque de un
`<li>`.** Cualquier otro elemento caía al camino inline, y `serializeInline` convierte `PRE > CODE`
en un único span de backticks, perdiendo el fence, el lenguaje y la indentación.

**2. ProseMirror descarta todo nodo del DOM que ninguna regla de esquema reclame, y ningún Node ni
Mark del proyecto reclamaba los nodos Comment.** El comentario se perdía al construir el documento
del editor, antes de que el usuario tocase nada y antes de que el serializador viese nada. Esta es
la lección general: en este subsistema, *cualquier* construcción del DOM sin un Node de TipTap que
la reclame se pierde en silencio al abrir el fichero.

### Fix

- `htmlToMarkdown.ts`: `PRE` se trata igual que `UL`/`OL` dentro de un `<li>`, a través del helper
  `pushIndentedBlock`, que extrae la indentación a 4 espacios que ya existía para las listas
  anidadas.
- `markdownToHtml.ts`: un comentario HTML que ocupe toda una línea y lleve contenido real se
  convierte, antes de `mdit.render()`, en `<div data-html-comment="URLENCODED"></div>`. Es el mismo
  patrón de sentinel que ya usaban `data-math-block` y `data-page-break`.
- `rich/extensions/rawComment.ts`: Node atom de grupo block que reclama `div[data-html-comment]`,
  para que ProseMirror lo conserve. Se renderiza como una línea mono discreta con el texto del
  comentario, en vez de dejar un hueco sin explicación en el editor.
- `htmlToMarkdown.ts`: `serializeDiv` reconoce `data-html-comment` y devuelve `<!--contenido-->`.

### Trampa del entorno de test

**happy-dom, el entorno de vitest de esta suite, descarta los nodos Comment en su propio
`DOMParser`.** `parseFromString("<p>a</p><!--hi--><p>b</p>")` devuelve solo los dos `<p>`.
Consecuencias:

1. Un test que meta un Comment DOM crudo nunca podrá verificar el camino defensivo de
   `htmlToMarkdown` que lee `Node.COMMENT_NODE`. No perder tiempo con eso ni concluir que el fix no
   funciona.
2. Es un argumento a favor del sentinel: cuando el comentario viaja como
   `<div data-html-comment="...">` es un Element, y happy-dom sí lo conserva.
3. Para probar la capa de ProseMirror hay que construir un `Editor` de TipTap dentro del test, como
   hace `rich/extensions/rawComment.test.ts`. Un `Editor` con solo `StarterKit` no registra la
   extensión de tablas, así que una tabla se aplana en ese arnés: es artefacto del test, no un bug.

### Limitaciones conocidas que quedan

- **Comentarios HTML de varias líneas**: se siguen perdiendo. El sentinel es de una línea porque el
  pre-proceso trabaja línea a línea, antes de que exista cualquier estructura de bloque.
- **Comentarios inline** en medio de un párrafo (`texto <!-- nota --> más texto`): se pierden. El
  sentinel es un `div` de bloque y no puede montarse dentro de un párrafo.
- **Comentarios dentro de un blockquote** (`> <!-- x -->`): no se transforman, porque el `>` inicial
  hace que la línea no sea un comentario completo.
- **Reflow de párrafos partidos a mano** y normalización del padding de las columnas de una tabla:
  no son este bug. Son pérdida de formato inherente a cualquier round-trip vía AST (CommonMark trata
  el salto de línea simple como un espacio) y no tienen arreglo razonable.
- Si el comentario estaba pegado a un párrafo sin línea en blanco por medio, ahora se conserva pero
  se le añade una línea en blanco. Es un cambio de formato, preferible a perder el contenido.

### Lección

Antes de tocar el serializador, decide en cuál de las tres capas se pierde el contenido. Y si lo que
se pierde es una construcción del DOM que no es un elemento con nombre (un comentario, una
instrucción de proceso, un atributo exótico), la respuesta casi siempre es la misma: hace falta un
sentinel con un atributo `data-*` más un Node de TipTap que lo reclame, porque ProseMirror no
conserva nada que su esquema no nombre.

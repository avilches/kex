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

## Bug 1: al guardar desaparecen los comentarios HTML y se aplanan los bloques de codigo de una lista (RESUELTO)

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
- `markdownToHtml.ts`: un comentario HTML que empiece en su propia línea y lleve contenido real se
  convierte, antes de `mdit.render()`, en `<div data-html-comment="URLENCODED"></div>`. Es el mismo
  patrón de sentinel que ya usaban `data-math-block` y `data-page-break`. Si el comentario abarca
  varias líneas, el escaneo avanza hasta la línea que lo cierra y mete el cuerpo entero, con sus
  saltos de línea y su sangría, en el mismo atributo, así que vuelve a salir byte a byte.
- `tiptap/extensions/rawComment.ts`: Node atom de grupo block que reclama `div[data-html-comment]`,
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
   hace `tiptap/extensions/rawComment.test.ts`. Un `Editor` con solo `StarterKit` no registra la
   extensión de tablas, así que una tabla se aplana en ese arnés: es artefacto del test, no un bug.

### Limitaciones conocidas que quedan

- **Comentarios sin cerrar** (`<!--` sin su `-->`): CommonMark dice que el comentario llega hasta el
  final del documento, así que markdown-it se come lo que venga detrás. Es comportamiento anterior a
  este fix y no se toca; lo que sí se garantiza es que el escaneo se rinde en vez de inventarse un
  sentinel.
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

---

## Bug 2: abrir un .md y guardarlo lo reescribe aunque no se pierda contenido (RESUELTO)

### Síntoma

Tras arreglar el bug 1, abrir el `CLAUDE.md` del repo en el editor rico y guardar sigue produciendo
un diff enorme. Ya no se pierde contenido: lo que cambia es el formato. Los párrafos partidos a mano
a 100 columnas salen en una sola línea larga, el padding de las columnas de las tablas se normaliza,
y dos líneas en blanco seguidas se quedan en una.

### Causa raíz

`MarkdownDocumentBuffer.isDirty()` compara el markdown serializado desde el editor contra el texto
que se leyó del disco. Pero el round-trip normaliza el formato por diseño, así que esos dos textos
no coinciden nunca para un fichero escrito a mano: **el buffer se declara sucio sin que el usuario
haya tocado nada**, en cuanto cualquier transacción de ProseMirror dispara el `onUpdate` de
`RichMarkdownEditor` (una extensión que normalice el documento al cargarlo basta).

A partir de ahí, cualquiera de los tres caminos de guardado escribe la versión normalizada: el Cmd+S
explícito, el autosave de `editorAutoSaveDelay`, y el flush de desmontaje de `useMarkdownDocument`,
que llama a `saveNow()` si el buffer está sucio. Ese último es el peor, porque reescribe el fichero
por el simple hecho de haber abierto y cerrado el tab.

El reflow en sí no tiene arreglo dentro de esta arquitectura: CommonMark trata el salto de línea
simple como un espacio, así que el documento de ProseMirror no tiene dónde guardar "aquí había un
salto de línea suave". Es exactamente el modo de fallo que anticipaba `TIPTAP_VS_MILKDOWN.md`.

### Fix

Se separa "el fichero ha cambiado" de "el usuario ha editado". `MarkdownDocumentBuffer` guarda una
línea base opcional, `baselineBody`, con lo que serializa el documento recién cargado, e `isDirty()`
devuelve falso cuando el cuerpo coincide con ella. `MarkdownTab` la registra una vez por revisión,
en un efecto que dispara cuando la instancia del editor ya existe, llamando al `serialize()` del
propio editor.

Se toma del editor, no de `htmlToMarkdown(markdownToHtml(body))`, a propósito: TipTap normaliza el
documento al parsear el HTML, así que la forma normal de la capa pura no siempre coincide con lo que
el editor emitiría. La línea base tiene que salir de la misma tubería que produce lo que se
guardaría.

La línea base se descarta al guardar (`markSaved`) y al recargar de disco (`replaceFromDisk`). Lo
primero importa: sin descartarla, deshacer hasta volver a la forma cargada dejaría de considerarse
un cambio y no se guardaría, con el fichero ya normalizado en el disco.

### Lo que este fix NO arregla, a propósito

- **En cuanto se edita una palabra y se guarda, el fichero entero se reformatea.** Garantizar la
  fidelidad también en ese caso es la pregunta arquitectónica que plantea `TIPTAP_VS_MILKDOWN.md`, y
  es otra tarea.
- La línea base se registra **una sola vez por revisión**, cuando aparece la instancia del editor.
  Si alguna extensión normalizase el documento en una transacción posterior a ese momento, el buffer
  volvería a declararse sucio y el autosave escribiría. Es una decisión consciente: la alternativa
  (seguir aceptando líneas base nuevas mientras el editor no haya tenido el foco) podría tragarse
  una edición de verdad, y perder una edición es peor que reformatear un fichero.

### Lección

Un editor WYSIWYG sobre markdown escrito a mano tiene dos problemas distintos que conviene no
mezclar: la pérdida de contenido, que se arregla nodo a nodo, y la normalización de formato, que no
se arregla y que por tanto no debe llegar a disco por su cuenta.

---

## Milkdown: hallazgos del corpus de round-trip (evaluación, no un bug que arreglar)

Milkdown (`@milkdown/crepe`) es un segundo motor rico, seleccionable por tab (`markdownEngine: "milkdown"`),
añadido para evaluar si es una alternativa viable al puerto de TipTap documentado arriba. A diferencia del
corpus de TipTap (`lib/roundTrip.test.ts`, que encadena las dos funciones puras `markdownToHtml` /
`htmlToMarkdown` sin pasar por un editor real), el corpus de Milkdown
(`milkdown/roundTrip.test.ts`) monta un `Crepe` real con `createTestCrepe` y llama a `getMarkdown()`, así que
mide lo que el editor de verdad produce, no solo la capa de conversión pura. Quince casos, todos pasan, ninguno
necesitó `it.fails`.

Resultado, caso por caso (primera pasada frente al texto de entrada):

- **Estables tal cual** (la primera normalización ya es idéntica a la entrada): encabezados, código con
  lenguaje, bloque de matemáticas, matemáticas inline, un fence de mermaid, enlace con título, blockquote,
  strikethrough, HTML inline crudo, y **el comentario HTML**.
- **Normalizados en la primera pasada pero estables en la segunda** (idempotentes, sin pérdida de contenido):
  listas anidadas y el bloque de código anidado en una lista (el marcador `-` se convierte en `*`), lista de
  tareas (`-` a `*`), tabla (el separador `---` se acorta a `-`), e imagen (el texto alt `alt` se reescribe
  como `1.00`, una rareza genuina de Crepe, no un error de transcripción: ver más abajo).

### Las tres construcciones que rompían a TipTap (bug 1 de este documento), vistas en Milkdown

- **Comentarios HTML**: Milkdown los conserva de fábrica, byte a byte, sin necesitar ningún sentinel ni Node
  a medida. TipTap necesitó el sentinel `data-html-comment` + el Node `rawComment` porque ProseMirror
  descarta cualquier nodo del DOM que ningún Node/Mark reclame; el esquema de Milkdown, en cambio, sí sabe
  representar un comentario como parte del documento.
- **Bloques de código anidados en una lista**: Milkdown los conserva enteros (fence, lenguaje e indentación),
  solo cambia el carácter del marcador de lista. TipTap, antes del bug 1, los aplanaba en un span de código
  roto con saltos de línea literales; Milkdown nunca tuvo ese problema en este corpus.
- **Saltos de línea suaves (soft line breaks)**: el corpus **no incluye ningún caso** que ejercite esto (a
  diferencia del corpus de TipTap, que sí tiene `hardBreak`). No se puede afirmar cómo se comporta Milkdown
  aquí a partir de lo medido; queda como hueco de cobertura, no como hallazgo.

### La rareza del alt text de imagen (`alt` a `1.00`)

El caso `["image", "![alt](./img.png)\n"]` normaliza a algo con el texto alt `1.00` en vez de `alt`. No es un
error de transcripción del corpus: es lo que Crepe realmente produce en la primera pasada, y a partir de ahí
es estable (la segunda pasada no lo vuelve a cambiar). Ninguna de las herramientas de este repo reescribe el
alt text a mano; hay que asumir que es un comportamiento propio del bloque de imagen de Crepe y tratarlo como
una pega conocida del motor, no como algo que arreglar en el código de Kex.

### Relación con el mermaid fence de este corpus

El caso `mermaid fence` sale "estable tal cual" porque lo único que mide el corpus es el texto markdown que
entra y sale de Crepe, no si se dibuja un diagrama. El fence sobrevive intacto porque `@milkdown/plugin-diagram`
nunca se llegó a montar en el editor (ver `docs/FORK.md`); si algún día se monta un plugin de mermaid
compatible, este caso habrá que revisarlo porque el node schema podría cambiar la representación interna del
fence.

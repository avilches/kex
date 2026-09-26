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

## Bug 3: un tab markdown no reacciona a un cambio externo del fichero, y "Reload from disk" a veces no hace nada visible (RESUELTO)

### Síntoma

Con un `.md` abierto en modo Source, editarlo desde otra app (u otro proceso: git, un formateador)
no actualizaba el contenido mostrado, aunque el mismo tab en modo Rich sí reaccionaba. Y por
separado, incluso cuando aparecía el aviso de conflicto (buffer sucio + cambio externo) y se elegía
explícitamente "Reload from disk", el editor a veces se quedaba mostrando el texto local sin
cambiar, dando la impresión de que el botón no hacía nada.

### Pistas falsas descartadas

Los dos síntomas parecían el mismo bug ("el reload no funciona"), pero eran cuatro causas
independientes en capas distintas, encontradas una detrás de otra según se iba probando cada caso:

1. **Registro que falta.** El `EditorPane` embebido en modo Source de un tab markdown nunca se
   registraba en `useEditorFileSync` (`src/modules/editor/useEditorFileSync.ts`), porque esa lista
   solo recoge tabs cuyo `kind` es `"editor"`, y un tab markdown conserva `kind: "markdown"` aunque
   por dentro esté mostrando ese mismo componente. Su `reload()` nunca se llamaba.
2. **Modo Rich con el vigilante equivocado.** `useMarkdownDocument.ts` solo escuchaba
   `fs:file-written`, el eco que Kex emite al guardar él mismo (`source: "editor"`), nunca el
   vigilante real del sistema de ficheros (`fs:changed`, respaldado por `fs_watch_add` en Rust). Una
   edición hecha desde fuera de la app nunca generaba ese primer evento.
3. **El dedup de "Reload from disk" bloqueaba la propia recarga forzada.** `performReload`
   (`useDocument.ts`) y `MarkdownDocumentBuffer.replaceFromDisk` descartan una recarga cuando el
   contenido del disco coincide con el último leído (`savedRef`/`savedRaw`), pensado para no volver
   a renderizar en un evento de vigilante duplicado sobre un buffer limpio. Pero "Reload from disk"
   (`force=true`) tiene que sustituir el buffer sucio pase lo que pase, y ese `if` no distinguía el
   caso forzado: si el disco resultaba ser igual al último valor conocido (p. ej. el cambio externo
   se revirtió, o simplemente no había cambiado desde la última sincronización), la recarga forzada
   se descartaba en silencio y el buffer sucio se quedaba intacto.
4. **`@uiw/react-codemirror` compara por valor, no por identidad.** Aun arreglado el punto 3, el
   editor seguía sin refrescarse visualmente en el caso más habitual de prueba: cuando el texto que
   había que restaurar coincidía, letra por letra, con el último valor que `doc.content` tuvo en
   React. Ni escribir en CodeMirror ni guardar (`saveNow`) actualizan `doc.content`, solo un buffer
   interno; así que si una recarga trae de vuelta exactamente ese mismo texto, el `useEffect` interno
   de la librería que sincroniza su prop `value` (dependencia `[value, view]`, comparación por
   `===`) concluye que "no ha cambiado nada" entre renders y nunca despacha la actualización, aunque
   lo que hay en pantalla (por haber escrito algo, o por un save que no tocó `doc.content`) sea otra
   cosa completamente distinta.

### Causa raíz

Cuatro huecos separados que solo se manifestaban juntos porque compartían el mismo escenario de
prueba (el mismo fichero, el mismo texto reutilizado en cada intento): un componente nunca
registrado, un vigilante nunca conectado, un `if` de deduplicación que no distinguía "recarga
forzada" de "evento duplicado", y una librería de terceros que decide si redibuja comparando texto
en vez de fiarse de que quien la llama ya sabe que algo cambió.

### Fix

1. `MilkdownTab.tsx` y `MarkdownTab.tsx` (tiptap) registran su `EditorPane` de Source vía
   `registerEditorHandle`, y `App.tsx` incluye los tabs markdown en la lista que sigue
   `useEditorFileSync`, con el mismo tag `kind: "editor"` que ya usa esa lista internamente (no es
   el `kind` real del tab, es la marca de "participa en este registro").
2. `useMarkdownDocument.ts` añade su propio `watchAdd`/`watchRemove` de directorio y su propio
   listener de `fs:changed`, igual que ya tenía `useEditorFileSync` para los tabs `editor`.
3. `performReload`/`replaceFromDisk` reciben un parámetro `force`, y el `if` de deduplicación se
   salta explícitamente cuando `force` es `true`: `if (!force && content === saved) return;`.
4. `EditorPane` fuerza la sincronización con un `useEffect` propio que compara el texto que
   CodeMirror tiene *de verdad* (`view.state.doc.toString()`) contra `doc.content`, y despacha un
   cambio si difieren; se dispara por la identidad de `doc` (un objeto nuevo en cada `setDoc`), no
   por su contenido, así que no le afecta la comparación por valor de la librería.

### Lección

Cuando "no reacciona a un cambio externo" y "el botón de recargar no hace nada" se investigan en la
misma sesión con el mismo fichero de prueba, conviene sospechar que hay más de una causa apilada:
cada arreglo destapaba el siguiente síntoma exactamente porque el anterior ya no lo tapaba. Y con
componentes de terceros que exponen una prop "controlada" (aquí, `value` de CodeMirror), conviene
no asumir que basta con actualizar el estado de React: hay que comprobar bajo qué condición esa
librería decide, por su cuenta, si merece la pena redibujar.

---

## Bug 4: guardar en modo Rich y volver a el tras pasar por Source muestra un tercer contenido (RESUELTO)

### Síntoma

Con un tab markdown (tiptap o milkdown) en modo Rich con cambios sin guardar: al pasar a Source
(lo que guarda esos cambios en disco, ver la nota de diseño más abajo), editar algo más ahí, y
volver a Rich, el editor rico no mostraba ni la última edición hecha en Source ni el contenido del
disco: mostraba el texto que había en Rich la primera vez que se abrió el tab, muchos pasos atrás.

### Pistas falsas descartadas

Se sospechó primero de una carrera entre el reload explícito del toggle y el evento `fs:changed`
real que dispara el propio guardado (ambos llaman a `reload()` sobre el mismo hook). Instrumentar
con trazas temporales en cada eslabón (`toggleMode`, `performReload`, el `watchAdd`/listener de
`fs:changed`, el `useMemo` de HTML y el efecto de sincronización de `RichMarkdownEditor`, y el
efecto de arranque de `MilkdownEditor`) descartó esa carrera: el evento duplicado se bloquea
correctamente por el dedup de `replaceFromDisk` sin causar daño.

### Causa raíz

`saveNow()` en `useMarkdownDocument.ts` escribe el contenido a disco y llama a `buf.markSaved()`
(que sincroniza el buffer interno `MarkdownDocumentBuffer`), pero nunca llamaba a `setDoc(...)`.
El estado React `doc.body` (lo que un `RichMarkdownEditor`/`MilkdownEditor` recién montado usa como
contenido inicial) se queda congelado en el valor que tenía al abrir el tab o en el último reload
real, sin enterarse nunca de un guardado explícito ni de un autosave. Mientras el editor rico sigue
montado esto no se nota (edita su propio estado interno, no `doc.body`), pero en un ciclo
Rich -> Source -> Rich el editor rico se desmonta y se vuelve a montar desde cero, leyendo
`doc.body` como contenido inicial: ahí aparece el valor viejo. El watcher de `fs:changed` no lo
corrige porque su dedup compara contra el buffer (`savedRaw`), que sí está al día tras el guardado,
así que descarta la actualización pensando que es un eco duplicado.

### Fix

`saveNow()` ahora llama también a `setDoc({status:"ready", body: buf.getBody(), revision:
revisionRef.current})` tras `markSaved()`, sin incrementar `revisionRef`. No incrementar la
revision es la parte importante: el `useMemo` de HTML de `RichMarkdownEditor` y el efecto de
arranque de `MilkdownEditor` solo reaccionan a un cambio de `revision`, así que un editor rico ya
montado y en edición activa no se ve forzado a refrescarse por su propio guardado; solo un montaje
fresco posterior (que siempre parte de los props actuales, sin importar si `revision` cambió) ve el
contenido correcto.

### Lección

Un hook con un buffer interno (ref) y un estado React expuesto (`doc`) puede parecer sincronizado
mientras el consumidor no se desmonta, porque el consumidor edita su propio estado interno y nunca
vuelve a leer `doc.body`. La desincronización solo se manifiesta en el siguiente montaje fresco, así
que cualquier operación que toque el buffer (`markSaved`, `replaceFromDisk`, `setBody`) debe dejar
`doc` en el mismo estado que el buffer, aunque ningún componente montado lo esté pidiendo en ese
momento.

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

# Themes

Reglas para tocar temas, paletas y la pagina de preview. Movidas desde `CLAUDE.md`; `docs/BUILD.md` ("Theme preview page") explica el uso tecnico de la pagina.

## Cambios de theme: verificar siempre en la pagina de preview

Cualquier peticion sobre themes (cambiar un color, ajustar contraste, anadir un theme nuevo, tocar
`inactivePaneDim`, los colores de git o del terminal) se hace y se comprueba en la pagina
`theme-preview.html`, no arrancando la app ni con capturas de pantalla:

1. Arrancar `pnpm dev` (elige solo un puerto libre; Vite imprime cual) y abrir
   `http://localhost:<puerto>/theme-preview.html?theme=<id>&mode=light|dark&view=swatches|app`.
   `view=swatches` lista cada superficie y cada token con su hex; `view=app` monta una
   aproximacion de la aplicacion (WorkspaceBar con tabs de ejemplo, Sidebar de Explorer y de
   Source Control, Header, terminal, editor y el par de Live Preview) dos veces, con el foco en
   cada panel. Ambas vistas son estaticas: todos los estados (con foco y sin foco) estan a la vez
   en pantalla, sin hacer clic en nada.
   El tema se cambia con un boton por tema o con las flechas (izquierda/derecha recorren los temas,
   arriba/abajo cambian de modo). El tuner son doce sliders pequenos que mueven familias de tokens (superficies, bordes, texto,
   acento, fondos de editor y terminal, los 16 ANSI) y el alfa del texto normal y del ignorado, con el hex y el ratio ya compuestos: sirve para buscar un valor a
   ojo. "Export full theme (copy)" copia el tema entero con esos valores, por si hace falta fuera del repo.
   "Save to disk" escribe los valores cambiados en `src/modules/theme/themes/<id>.ts` (solo funciona con
   `pnpm dev`) editando solo las lineas que cambian, y recarga la pagina con el tema tal cual quedo en
   disco, listo para revisar el `git diff` y commitear.
2. Editar `src/modules/theme/themes/*.ts`; Vite recarga la pagina solo. Leer el resultado con
   `window.kexThemePreview.dump()` (hex de todos los tokens y de los colores de git) o con los
   atributos `data-hex`, nunca con una captura: Dark Reader falsea los colores en Chrome.
3. Comprobar siempre los DOS modos (light y dark) y, si el cambio afecta al terminal o al editor,
   tambien el estado con foco y sin foco (`inactivePaneDim`).
4. Un theme nuevo debe verse bien en la pagina antes de darlo por terminado.

**Mantener la pagina al dia:** si se anade o cambia un componente o un estilo que use colores de
tema (una superficie nueva, un token nuevo en `ThemeColors`/`applyTheme.ts`, un estado nuevo como
otro chip de agente), hay que reflejarlo en `src/theme-preview/main.ts` en el mismo commit: la
lista `TOKENS`, la superficie correspondiente y la vista `app`. Las superficies de la pagina son
aproximaciones que copian las clases de los componentes reales, asi que no se actualizan solas.
Detalle de uso en `docs/BUILD.md`, seccion "Theme preview page".

## Añadir o cambiar una paleta (tema) sin romperla

Un tema vive en `src/modules/theme/themes/<id>.ts` y se registra en `themes/index.ts`. Estas son las
reglas que salieron de TASK-774, TASK-775 y TASK-777; saltarse cualquiera reproduce un fallo que ya
se pagó una vez.

**1. La paleta original se respeta; los colores atenuados son nuestros.**
- Los valores de la paleta oficial (fondo, texto, colores de acento, los 16 ANSI, el fondo de
  editor y de terminal si el original los distingue) se copian tal cual, sin retocarlos "porque
  quedan mejor". Los ficheros de tema guardan esos valores; lo que aplica la app sale de
  `withReadableTheme` (`readableColors.ts`), que `themes/index.ts` pasa por cada tema incluido al
  registrarlo (los temas del usuario no se tocan). Solo sube contraste, conservando el tono, y los
  suelos son: 4.5:1 para `foreground`, `*Foreground` sobre su superficie, `destructive` sobre
  `background` y `sidebar`, `link` sobre el fondo del editor y el texto del terminal (y sobre su
  seleccion); 3:1 para `tabFocusIndicator` sobre `background` y `sidebar`. Si el texto de un boton
  no llega ni con blanco o negro puros (`primaryForeground`/`sidebarPrimaryForeground`), cede el
  fondo (`primary`/`sidebarPrimary`), que se oscurece lo justo. `link` y `tabFocusIndicator`
  se derivan de `primary` si el tema no los define: el texto sobre `primary` y `primary` como
  texto sobre el fondo piden direcciones opuestas, por eso son tokens aparte.
- **Excepciones decididas (se quedan con el valor de la paleta):** los tonos ANSI de color (1-6 y
  9-14) de los temas oscuros, que bajan de 4.5:1 (peor caso, rojo de Gruvbox 2.69); xterm no los
  corrige en oscuro y TASK-785 decide ese contraste. Solo se separa del fondo `black`, `white` y
  `bright-white` (minimo 1.5:1, sin ser iguales al fondo) y `bright-black` (minimo 3:1).
- Los colores de git (`gitStatusColor.ts`) son tablas por esquema y modo, no por tema: cada tabla
  llega a 4.5:1 sobre el sidebar de todos los temas incluidos de su modo, y
  `themes/contrast.test.ts` lo fija. Si se anade un tema con un sidebar mas claro (en oscuro) o mas
  oscuro (en claro) que los existentes, el test dira que tabla hay que mover.
- Los tokens de sintaxis de los temas de editor (`editor/lib/themes.ts`) pasan por `readableSpec`:
  4.5:1 sobre su fondo y sobre el fondo del editor de cada tema de app que los empareja. Los temas de
  paquetes upstream (`@uiw/codemirror-theme-*`) se reconstruyen desde sus datos para ello.
- El H6 del Live Preview es un encabezado atenuado a proposito (`H6_TEXT_SHARE` en
  `markdownExtensions.ts`, 75% del texto); se mantiene en 3:1 o mas en todos los temas, no en 4.5.
- Los tokens que la paleta original no define (`muted`, `secondary`, `accent`, `border`, `input`,
  `ring`, `card`, `popover`, `sidebar*`) los derivamos nosotros mezclando su fondo y su texto, y se
  eligen mirando `theme-preview.html` (vistas `swatches` y `app`), no a ojo en el código: el texto de
  cada superficie debe leerse, el borde debe verse sobre su fondo y un chip sin seleccionar debe
  distinguirse del fondo. Se ajustan hasta que la preview lo confirme, en los DOS modos.
- Para el texto de un color con fondo variable (chips de workspace, botones) no se pone blanco ni
  negro a mano: `chipColorOnWhite` en `modules/workspaces/lib/workspaceColor.ts` (texto siempre blanco, y el color del fondo se oscurece lo justo para llegar a 4.5).

**2. Fondo del terminal y del editor: se eligen a propósito, no se heredan por accidente.**
- `colors.background` es el fondo de la interfaz. El fondo del terminal es `terminal.background` y el
  del editor es `editor.background` (ambos por variante). Si la paleta original usa el mismo color que
  la interfaz se pueden omitir; si usa otro (JetBrains: panel `#3c3f41`, editor y terminal
  `#2b2b2b`), hay que ponerlos, porque si no el editor y el terminal salen con el gris de la interfaz.
- Con el tema de editor en Auto el editor usa `editor.background` (o `background` si falta). El
  fondo del editor y el del tema de CodeMirror emparejado en `editorTheme` deben coincidir: se
  comprueba con `kexThemePreview.dump()` (`editor-background`) contra el fondo del tema CM.
- Con un tema de editor concreto, el editor toma el fondo y el texto de ese tema CM (los lee
  `editor/lib/editorThemeSurface.ts`), no los del tema de app.
- Un terminal en Auto usa la paleta del tema de app. Con una paleta elegida a mano, la paleta
  prestada rellena lo que no define (fondo, texto, cursor, selección) con los colores de SU tema, nunca
  con los del tema activo (`resolveTerminalPalette`). Un tema nuevo no necesita repetir esos valores.
- Una superficie de editor o de terminal que pinta un componente nuevo usa `--editor-background` /
  `--editor-foreground` / `--terminal-background`; nunca `bg-background` ni un `transparent
  !important`. Hoy las usan: CodeMirror del código (`editor/lib/extensions.ts`), markdown en Source y
  Rich (`markdownExtensions.ts`, ojo: el modo Rich añade una segunda regla con `Prec.high` que
  también hay que tocar), `MarkdownPreviewPane`, `EditorPathBar`, `TerminalPathBar` y el contenedor
  de `TerminalPane` (sin esto asoman franjas del color de la interfaz en los bordes del xterm).

**3. NUNCA un tema sin sus dos modos, oscuro y claro.** Ni en `colors` ni en `editorTheme`. Un tema sin
variante para un modo cae en silencio a la otra (`variants[mode] ?? dark ?? light`), y eso es un fallo,
no un atajo. Si la paleta original solo existe en un modo, hay dos salidas y solo dos: buscar en
internet la versión oficial del otro modo (Kanagawa Dragon tiene la suya en Lotus) o crearla nosotros
a partir de la paleta original, con las reglas 1 y 2. Si la versión del otro modo ya existe como tema
de la misma familia se reutiliza importándola, sin copiar valores (`light: kanagawa.variants.light`) y
se empareja `editorTheme.light`. `themes/themes.test.ts` falla si un tema incluido no cumple esto.
- **En Auto, editor y terminal siguen el modo del tema.** Cada tema incluido define en cada modo su
  propia paleta de terminal (16 colores ANSI más fondo, texto, cursor y selección) con un fondo de la
  misma luminosidad que el modo, y empareja un tema de editor del mismo modo (`EDITOR_THEME_MODE`). Si el
  original no trae uno, se crea (Kex Default tiene el suyo en claro y en oscuro). `themes/themes.test.ts`
  falla si un tema no lo cumple. Un terminal oscuro sobre un tema claro solo es válido si el usuario lo
  elige a mano; `paletteOf` (`resolveTerminalPalette`) conserva ese recurso de prestar la paleta del otro
  modo para los temas propios del usuario, que sí pueden traer un solo modo.
- **Terminal claro y programas hechos para fondo oscuro:** los programas pintan blanco o amarillo claro,
  que desaparece sobre un fondo claro. No se arregla retocando la paleta: xterm sube el contraste solo
  en modo claro (`minimumContrastRatio` 4.5, `minimumContrastRatioFor`); en oscuro se queda en 1 para
  no alterar los colores del tema. Al probar un tema claro se mira un diff o la salida de un programa
  con colores claros, no solo el prompt.

**4. Un tema de editor nuevo (CodeMirror)** se da de alta en `EDITOR_THEMES`, `EDITOR_THEME_MODE` y
`EDITOR_THEME_LABELS` (`settings/store.ts`) y en `EDITOR_THEME_EXT` (`editor/lib/themes.ts`), y el
tema de app lo empareja en `editorTheme: { dark, light }`.

**5. Al probar, comprobar antes el estado.**
- `terminalTheme` y `editorTheme` en `settings-general.json` (`user-data/support-dev/`): una paleta
  elegida a mano gana siempre sobre el tema de app, así que "el terminal no cambia" casi siempre es un
  valor distinto de `auto`. Se prueba con las dos preferencias en Auto.
- La Kex instalada (`/Applications/Kex.app`) no lleva los cambios de una rama: se prueba con
  `pnpm tauri dev` desde el worktree. Cada worktree usa su propio puerto de Vite (lo elige
  `scripts/tauri.mjs` y lo imprime al arrancar), así que no hace falta tocar `tauri.conf.json`.
- Se mira siempre el editor de código, el markdown en Source, Rich y Preview, el terminal, las
  muestras de Settings (Editor theme y Terminal theme) y las barras de ruta, en dark y en light.

**6. Tests que lo fijan:** `resolveTerminalTheme.test.ts` (paleta prestada y sus valores por defecto),
`resolveEditorSurface.test.ts` (fondo del editor en Auto y con tema concreto), `resolveEditorTheme.test.ts`
y `validateTheme.test.ts`. Un cambio en cómo se resuelve un color de terminal o de editor añade su caso
ahí antes de tocar el código.

**7. Color de las notas flotantes.** El fondo de una nota de tab no es el del editor: `noteSurface`
(`modules/theme/noteSurface.ts`) mezcla el fondo del editor con un amarillo y `applyTheme` lo publica como
`--note-editor-*` (sobre el fondo del editor) y `--note-terminal-*` (sobre el del terminal), con
`-background` y `-foreground` cada uno (el texto sube de contraste hasta 4.5:1). La nota usa el par del tab
sobre el que se dibuja (`noteSurfaceKind`: terminal o editor), no el de su propio tab, porque el editor y el
terminal pueden estar en un modo distinto al de la app y entre sí. Por defecto es un amarillo
cálido en claro y uno verdoso en oscuro (uno cálido sobre oscuro vira a marrón). Una variante puede fijar su
propio tinte con `noteTint: { color, amount }` (`amount` de 0 a 1), o intensificar el de por defecto con
`noteStrong: true`; hoy `noteTint` está en el modo oscuro de varios temas y `noteStrong` en Kanagawa claro.
La vista `app` de `theme-preview.html` pinta una nota de muestra por cada superficie en el Sidebar, y la mini preview de temas
de Settings pinta una mininota con la misma superficie (ambas via `variantNoteSurface`).

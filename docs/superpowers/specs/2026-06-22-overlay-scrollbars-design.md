# Diseno: scrollbars finas en editor, diff, terminal y paneles

## Contexto

Kex oculta TODAS las scrollbars nativas por defecto mediante un kill switch global en
`src/styles/globals.css`. El motivo: Linux y Windows renderizan barras de Chromium
gruesas que rompen el chrome, y macOS WKWebView parpadea su overlay durante transiciones.
Como consecuencia, el editor (CodeMirror), el diff de git, el terminal (xterm) y los
paneles del lateral derecho tienen scroll funcional pero ninguna affordance visual.

Objetivo: dar scrollbars finas y discretas en esas zonas, sin reactivar las barras
nativas gruesas en el resto de la app.

## Decisiones tomadas

- **Mecanismo**: propiedades estandar `scrollbar-width: thin` + `scrollbar-color`, NO
  `::-webkit-scrollbar`. Razon (descubierta durante la implementacion): el kill switch
  pone `scrollbar-width: none` sobre `html *`, que WKWebView respeta y que anula cualquier
  estilado de `::-webkit-scrollbar`. La unica forma fiable de revivir la barra es
  sobreescribir `scrollbar-width`. Ademas `scrollbar-width`/`scrollbar-color` estan
  soportados por los tres webviews objetivo (WKWebView, WebKitGTK, WebView2).
- **Comportamiento**: fina y fija mientras haya overflow (no auto-hide). Al darle color
  custom, el webview la renderiza no-overlay. Confirmado con el usuario frente a la
  alternativa auto-hide (que exigiria renunciar al color del tema o anadir JS).
- **Color**: derivado del theme engine via `color-mix` sobre `var(--foreground)`.

## Mecanismo tecnico

- **Utility compartida** `.thin-scrollbar` en `globals.css`, agrupada con `.cm-scroller`:
  ```css
  .cm-scroller,
  .thin-scrollbar {
    scrollbar-width: thin !important;
    scrollbar-color: color-mix(in srgb, var(--foreground) 38%, transparent) transparent !important;
  }
  ```
  El `!important` gana al `scrollbar-width: none` del kill switch. Ademas el kill switch de
  `::-webkit-scrollbar` exime ambos selectores:
  `html *:not(.cm-scroller):not(.thin-scrollbar)::-webkit-scrollbar`.

- **Editor y git diff** (`.cm-scroller`, comparten el theme de CodeMirror en
  `lib/extensions.ts`): el theme ponia `padding: 8px` en `.cm-editor`, que separaba la
  barra del borde derecho. Se mueve el aire derecho al contenido: `.cm-editor` pasa a
  `paddingRight: 0` y `.cm-content` recibe `paddingRight: 8px`. Asi la barra queda pegada
  al borde y el texto conserva su margen. La barra horizontal solo aparece con overflow
  horizontal, es decir con word wrap desactivado.

- **Terminal** (`.xterm-scrollable-element > .scrollbar > .slider`): xterm 6 dibuja su
  propio overlay scrollbar (ScrollableElement de VSCode) como un `<div>` real, no como
  pseudo-elemento, asi que no le afecta `scrollbar-width`. La clase del slider es solo
  `slider` (sin modificador vertical/horizontal) y xterm inyecta un `<style>` inline con
  su background, por lo que se recolorea y estrecha (8px) con `!important`. Mantiene el
  auto-hide nativo de xterm. El terminal hace reflow al ancho del panel (FitAddon) y nunca
  scrollea en horizontal.

- **Markdown preview, explorer, source control, git history**: son `<div>` con scroll
  propio; se les anade la clase `.thin-scrollbar`. El preview de markdown necesitaba
  ademas `min-h-0` en su contenedor flex para que `overflow-auto` produzca scroll real
  (sin el, el flex item crece con el contenido y nunca desborda).

## Archivos afectados

- `src/styles/globals.css`: utility `.thin-scrollbar` + `.cm-scroller`, recoloreo del
  slider de xterm, exencion del kill switch.
- `src/modules/editor/lib/extensions.ts`: padding del editor movido al contenido.
- `src/modules/markdown/MarkdownPreviewPane.tsx`: clase + `min-h-0`.
- `src/modules/explorer/FileExplorer.tsx`,
  `src/modules/source-control/SourceControlPanel.tsx`,
  `src/modules/git-history/GitHistoryPane.tsx`: clase `.thin-scrollbar`.

## Fuera de alcance

- Auto-hide real (descartado por el usuario).
- Scroll horizontal en terminal (no aplica por el reflow).
- Paneles que ya usan `<ScrollArea>` de Radix (p. ej. el buscador del explorer).

## Verificacion

- `pnpm check-types`, `pnpm test`, `pnpm exec biome lint ./src` en verde.
- Manual: editor con word wrap OFF muestra barra vertical y horizontal pegadas al borde;
  con word wrap ON solo vertical. Diff igual. Terminal con scrollback muestra slider fino
  con color del tema, ninguna barra horizontal. Markdown preview, explorer, source control
  e history muestran barra vertical fina con listas largas.

## Nota de proceso

El diseno inicial proponia `::-webkit-scrollbar` + revelado en hover. La implementacion
real cambio a `scrollbar-width`/`scrollbar-color` tras descubrir, inspeccionando el DOM en
runtime, que WKWebView ignora el estilado de `::-webkit-scrollbar` cuando
`scrollbar-width: none` esta presente. Este documento describe lo implementado.

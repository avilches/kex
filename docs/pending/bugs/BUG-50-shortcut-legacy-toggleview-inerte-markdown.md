---
id: BUG-50
title: Shortcut editor.markdown.toggleView queda inerte para tabs markdown con el editor rich
area: markdown / shortcuts
severity: low
status: sin confirmar
---

## Descripcion

`src/app/App.tsx`, handler `"editor.markdown.toggleView"` (linea 2305-2312):

```ts
"editor.markdown.toggleView": () => {
  if (!activeTab || !activeTabId || !activeWorkspaceId) return;
  if (activeTab.kind === "editor" && isMarkdownPath(activeTab.path)) {
    toggleOverlayPreview(activeWorkspaceId, activeTabId);
  } else if (activeTab.kind === "markdown") {
    setTabView(activeWorkspaceId, activeTabId, "raw");
  }
},
```

Este shortcut es anterior a la existencia del editor rich (`MarkdownTab`,
`src/modules/markdown/rich/MarkdownTab.tsx`): la rama `activeTab.kind === "markdown"` llama a
`setTabView(..., "raw")`, que escribe un campo `view` en el tab. `MarkdownTab` no lee ningun campo
`view`: gestiona su propio estado independiente `mode` ("rich"/"source") internamente. Con
`markdownEditor: "rich"` (el valor por defecto), este shortcut queda silenciosamente inerte para tabs
markdown: no hace nada, no lanza error, pero tampoco hace lo que su label ("toggle view") promete. El
shortcut sigue siendo relevante para `kind === "editor"` con extension markdown (el toggle overlay
preview si sigue funcionando ahi).

## Impacto

Bajo: no hay crash ni perdida de datos, es un shortcut muerto (para el caso `kind === "markdown"`
especificamente) que puede confundir a un usuario que espera que alterne rich/source y no ve efecto.

## Fix sugerido

Elegir una de dos:

1. Eliminar la rama `activeTab.kind === "markdown"` de este shortcut (dejar que solo aplique a
   `kind === "editor"` con markdown), y verificar que `shortcutsDisabled` (`App.tsx` linea ~2520-2525)
   se actualiza igual para no ofrecer el shortcut como activo en tabs `markdown`.
2. Conectarlo al `toggleMode` propio de `MarkdownTab` (necesita exponer un handle/ref invocable desde
   `App.tsx`, similar a como otros handlers de editor usan `editorHandles.current.get(activeTabId)`
   linea 2330).

La opcion 2 preserva la funcionalidad esperada por el label del shortcut; la opcion 1 es el fix minimo si
se decide que el rich editor no necesita este atajo (tiene su propio control de UI para rich/source).

## Relacionado

`shortcutsDisabled` en `App.tsx` (~linea 2520) ya distingue `kind === "markdown"` para decidir si el
shortcut esta habilitado; cualquier fix debe mantener coherencia con esa funcion.

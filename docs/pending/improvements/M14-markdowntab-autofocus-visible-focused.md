# M14 - MarkdownTab: props visible/focused sin usar, sin autofocus al activar el tab

**Prioridad:** Media-baja
**Esfuerzo:** Bajo

## Contexto

`src/modules/markdown/rich/MarkdownTab.tsx` recibe `visible: boolean` y `focused: boolean` en su tipo
`Props` (linea 34, campos declarados en linea 37-38), pero ninguno de los dos se lee en el resto del
componente. No hay ningun efecto que autoenfoque el editor rich cuando su tab pasa a ser el tab activo
(por ejemplo, al cambiar de tab con Cmd+1..9, o al hacer click en un tab que estaba en segundo plano).

Los tabs de editor (stack CodeMirror, `EditorStack`) si autoenfocan en la situacion equivalente. Los tabs
markdown actualmente no, lo cual es una inconsistencia de UX entre los dos tipos de tab de edicion de
texto.

## Cambio propuesto

1. Confirmar el impacto real para el usuario (probar manualmente: cambiar a un tab markdown via teclado
   o click y ver si el foco cae en el editor rich o se queda en otro sitio, p.ej. el ultimo elemento
   enfocado).
2. Si se confirma la falta de autofocus, anadir un efecto en `MarkdownTab.tsx` que enfoque el editor
   TipTap cuando `props.focused` pasa a `true` (patron equivalente al que usa `EditorStack`/`EditorPane`
   para CodeMirror).

## Criterios de aceptacion

- Cambiar a un tab markdown (rich) via shortcut de tab o click deja el cursor listo para escribir en el
  editor, igual que ocurre hoy con un tab de editor CodeMirror.
- `pnpm lint`, `pnpm check-types`, `pnpm test` en verde.

## Relacionado

Plan original: `docs/superpowers/plans/2026-07-06-rich-markdown-editor.md`. Los props `visible`/
`focused` estaban presumiblemente pensados para una pasada de pulido posterior que no llego a
completarse dentro del plan.
